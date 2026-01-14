const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');

// Инициализация (используем переменные окружения из Render)
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Парсер для дат
function parseDate(text) {
  const now = new Date();
  const lower = text.toLowerCase();
  
  if (lower.includes('сегодня')) {
    return new Date(now.setHours(18, 0, 0, 0));
  }
  if (lower.includes('завтра')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0);
    return tomorrow;
  }
  if (lower.includes('послезавтра')) {
    const dayAfter = new Date(now);
    dayAfter.setDate(dayAfter.getDate() + 2);
    dayAfter.setHours(18, 0, 0, 0);
    return dayAfter;
  }
  
  // Через N дней
  const daysMatch = lower.match(/через (\d+) (день|дня|дней)/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    const future = new Date(now);
    future.setDate(future.getDate() + days);
    future.setHours(18, 0, 0, 0);
    return future;
  }
  
  // Время (15:00, 14:30)
  const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const timeDate = new Date(now);
    timeDate.setHours(hours, minutes, 0, 0);
    if (timeDate < now) timeDate.setDate(timeDate.getDate() + 1);
    return timeDate;
  }
  
  return null;
}

// Парсер для тегов
function parseTags(text) {
  const tags = text.match(/#[\wа-яА-Я_]+/g) || [];
  return tags.map(tag => tag.slice(1));
}

// Получить или создать пользователя
async function getOrCreateUser(ctx) {
  const telegramId = ctx.from.id;
  
  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();
  
  if (!user) {
    const { data: newUser } = await supabase
      .from('users')
      .insert({
        telegram_id: telegramId,
        username: ctx.from.username,
        first_name: ctx.from.first_name
      })
      .select()
      .single();
    user = newUser;
  }
  
  return user;
}

// Получить или создать проект
async function getOrCreateProject(userId, projectName) {
  let { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .ilike('name', projectName)
    .single();
  
  if (!project) {
    const { data: newProject } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        name: projectName
      })
      .select()
      .single();
    project = newProject;
  }
  
  return project;
}

// Команда /start
bot.command('start', async (ctx) => {
  await getOrCreateUser(ctx);
  return ctx.reply(
    `👋 Привет! Я помогу управлять твоими задачами.\n\n` +
    `📝 Просто напиши задачу:\n` +
    `"Созвониться с Иваном завтра в 15:00 #работа"\n` +
    `"Купить молоко сегодня #дом"\n\n` +
    `Команды:\n` +
    `/list — все задачи\n` +
    `/today — задачи на сегодня\n` +
    `/projects — мои проекты`
  );
});

// Команда /list
bot.command('list', async (ctx) => {
  const user = await getOrCreateUser(ctx);
  
  const { data: tasks } = await supabase
    .from('tasks')
    .select(`
      *,
      projects(name)
    `)
    .eq('user_id', user.id)
    .neq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (!tasks || tasks.length === 0) {
    return ctx.reply('У тебя пока нет активных задач! 🎉');
  }
  
  let message = '📋 Твои задачи:\n\n';
  tasks.forEach((task, i) => {
    const project = task.projects ? `[${task.projects.name}]` : '';
    const status = task.status === 'in_progress' ? '⏳' : '⭕';
    message += `${i + 1}. ${status} ${task.title} ${project}\n`;
  });
  
  return ctx.reply(message);
});

// Команда /today
bot.command('today', async (ctx) => {
  const user = await getOrCreateUser(ctx);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', user.id)
    .gte('due_date', today.toISOString())
    .lt('due_date', tomorrow.toISOString())
    .neq('status', 'done');
  
  if (!tasks || tasks.length === 0) {
    return ctx.reply('На сегодня задач нет! 🎉');
  }
  
  let message = '📅 Задачи на сегодня:\n\n';
  tasks.forEach((task, i) => {
    message += `${i + 1}. ${task.title}\n`;
  });
  
  return ctx.reply(message);
});

// Команда /projects
bot.command('projects', async (ctx) => {
  const user = await getOrCreateUser(ctx);
  
  const { data: projects } = await supabase
    .from('projects')
    .select(`
      *,
      tasks(count)
    `)
    .eq('user_id', user.id);
  
  if (!projects || projects.length === 0) {
    return ctx.reply('У тебя пока нет проектов. Создай задачу с тегом #проект');
  }
  
  let message = '📁 Твои проекты:\n\n';
  projects.forEach(project => {
    message += `• ${project.name}\n`;
  });
  
  return ctx.reply(message);
});

// Обработка обычных сообщений (создание задач)
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  
  // Пропускаем команды
  if (text.startsWith('/')) return;
  
  const user = await getOrCreateUser(ctx);
  const tags = parseTags(text);
  const dueDate = parseDate(text);
  
  // Убираем теги и даты из заголовка
  let title = text
    .replace(/#[\wа-яА-Я_]+/g, '')
    .replace(/сегодня|завтра|послезавтра/gi, '')
    .replace(/через \d+ (день|дня|дней)/gi, '')
    .replace(/\d{1,2}:\d{2}/g, '')
    .trim();
  
  // Ищем проект по первому тегу
  let projectId = null;
  if (tags.length > 0) {
    const project = await getOrCreateProject(user.id, tags[0]);
    projectId = project.id;
  }
  
  // Создаем задачу
  const { data: task } = await supabase
    .from('tasks')
    .insert({
      user_id: user.id,
      project_id: projectId,
      title: title,
      tags: tags,
      due_date: dueDate,
      remind_at: dueDate ? new Date(dueDate.getTime() - 15 * 60000) : null // напоминание за 15 минут
    })
    .select()
    .single();
  
  // Создаем напоминание
  if (dueDate) {
    await supabase.from('reminders').insert({
      task_id: task.id,
      scheduled_at: new Date(dueDate.getTime() - 15 * 60000)
    });
  }
  
  let response = `✅ Задача создана: "${title}"`;
  if (tags.length > 0) response += `\n📁 Проект: ${tags[0]}`;
  if (dueDate) response += `\n⏰ Напоминание: ${dueDate.toLocaleString('ru-RU')}`;
  
  return ctx.reply(response);
});

// Обработка callback от кнопок (статус задачи)
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const [action, taskId] = data.split(':');
  
  if (action === 'done') {
    await supabase
      .from('tasks')
      .update({ status: 'done' })
      .eq('id', taskId);
    
    await ctx.answerCbQuery('✅ Задача выполнена!');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } else if (action === 'progress') {
    await supabase
      .from('tasks')
      .update({ status: 'in_progress' })
      .eq('id', taskId);
    
    await ctx.answerCbQuery('⏳ В процессе');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } else if (action === 'snooze') {
    // Отложить на 1 час
    const newTime = new Date(Date.now() + 60 * 60000);
    await supabase
      .from('reminders')
      .insert({
        task_id: taskId,
        scheduled_at: newTime
      });
    
    await ctx.answerCbQuery('⏰ Напомню через час');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  }
});

// Система напоминаний (каждую минуту проверяем)
cron.schedule('* * * * *', async () => {
  const now = new Date();
  
  const { data: reminders } = await supabase
    .from('reminders')
    .select(`
      *,
      tasks(*, users(telegram_id))
    `)
    .eq('sent', false)
    .lte('scheduled_at', now.toISOString());
  
  if (reminders) {
    for (const reminder of reminders) {
      const task = reminder.tasks;
      const telegramId = task.users.telegram_id;
      
      try {
        await bot.telegram.sendMessage(
          telegramId,
          `🔔 Напоминание: ${task.title}`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Выполнено', `done:${task.id}`),
              Markup.button.callback('⏳ В процессе', `progress:${task.id}`)
            ],
            [
              Markup.button.callback('⏰ Отложить на 1ч', `snooze:${task.id}`)
            ]
          ])
        );
        
        await supabase
          .from('reminders')
          .update({ sent: true })
          .eq('id', reminder.id);
      } catch (error) {
        console.error('Ошибка отправки напоминания:', error);
      }
    }
  }
});

// Запуск бота
bot.launch();
console.log('🤖 Бот запущен!');

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));