# today: будущая архитектура Supabase + SQL

Сейчас приложение остаётся статическим PWA и хранит локальные тестовые аккаунты и задачи в `localStorage`. Это специально сделанный промежуточный слой: интерфейс уже многопользовательский, но сервер пока не нужен. При подключении Supabase локальный адаптер заменяется сетевым, а экран входа и модель задачи остаются почти теми же.

## 1. Что хранится сейчас

### Пользователи

Ключ `today.users.v1` содержит массив локальных тестовых пользователей:

```json
{
  "id": "uuid",
  "name": "dima",
  "nameKey": "dima",
  "salt": "случайная строка",
  "passwordHash": "sha-256(salt + password)",
  "createdAt": "2026-08-06T15:00:00.000Z"
}
```

Пароль в открытом виде не сохраняется. Это всё равно не production-аутентификация: JavaScript и `localStorage` находятся на устройстве пользователя и не заменяют серверную систему авторизации.

### Сессия

Ключ `today.session.v1`:

```json
{
  "userId": "uuid",
  "name": "dima",
  "startedAt": "2026-08-06T15:00:00.000Z"
}
```

### Задачи

Каждый пользователь получает отдельный ключ:

```text
today.tasks.v2.<userId>
```

Поэтому два локальных аккаунта не видят задачи друг друга.

## 2. Что будет хранить Supabase

Supabase состоит здесь из двух связанных частей:

1. **Supabase Auth** хранит учётную запись, хэш пароля, сессии и refresh-токены в системной схеме `auth`.
2. **PostgreSQL** хранит открытые данные приложения в таблицах `public.profiles` и `public.tasks`.

Пароли никогда не записываются в `profiles` или `tasks`.

```text
auth.users
    1
    │ id
    1
public.profiles
    1
    │ id = user_id
    n
public.tasks
```

SQL для создания таблиц, индексов, триггеров и RLS лежит в [`supabase/schema.sql`](../supabase/schema.sql).

## 3. Как оставить вход только по name + password

Supabase Auth штатно работает с email/password. Чтобы пользователь видел только `name` и `password`, клиент создаёт внутренний технический email из нормализованного имени:

```text
name: "Dima"
username_key: "dima"
internal email: sha256("dima")@today.local
```

Этот адрес не показывается пользователю и не используется для почты. В настройках Supabase для такой схемы нужно отключить обязательное подтверждение email. В production пароль должен соответствовать минимальной длине, настроенной в Supabase, обычно не менее 6 символов.

Нормализация имени должна быть одинаковой при регистрации и входе:

```js
const username = name.trim();
const usernameKey = username.toLocaleLowerCase();
const internalEmail = `${await sha256(usernameKey)}@today.local`;
```

## 4. Регистрация

Клиент отправляет пароль в Supabase Auth по HTTPS. Supabase создаёт запись в `auth.users`. Триггер `on_auth_user_created` автоматически создаёт связанную строку в `public.profiles`.

```js
const { data, error } = await supabase.auth.signUp({
  email: internalEmail,
  password,
  options: {
    data: {
      username,
      username_key: usernameKey
    }
  }
});

if (error) throw error;
```

Под капотом последовательность такая:

```text
browser
  → POST /auth/v1/signup
  → auth.users: INSERT
  → trigger handle_new_user()
  → public.profiles: INSERT
  → access token + refresh token
  → browser stores Supabase session
```

## 5. Вход

```js
const { data, error } = await supabase.auth.signInWithPassword({
  email: internalEmail,
  password
});

if (error) throw error;
```

После успешного входа Supabase возвращает JWT. В нём находится `sub`, то есть UUID текущего пользователя. PostgreSQL-функция `auth.uid()` читает этот UUID из токена.

## 6. Чтение задач

```js
const { data: tasks, error } = await supabase
  .from('tasks')
  .select('*')
  .order('task_date', { ascending: true })
  .order('task_time', { ascending: true, nullsFirst: false });

if (error) throw error;
```

SQL-смысл запроса примерно такой:

```sql
select *
from public.tasks
where user_id = auth.uid()
order by task_date, task_time nulls last;
```

Клиент может не передавать `where user_id = ...`: политика RLS всё равно автоматически отрежет чужие строки. Человечество всё-таки иногда изобретает полезные стены.

## 7. Создание задачи

```js
const { data: task, error } = await supabase
  .from('tasks')
  .insert({
    user_id: user.id,
    body: text,
    task_date: date,
    task_time: time || null,
    priority,
    is_done: false
  })
  .select()
  .single();

if (error) throw error;
```

RLS проверяет:

```sql
user_id = auth.uid()
```

Даже если кто-то подменит `user_id` в DevTools, база отклонит запрос.

## 8. Изменение и завершение задачи

```js
const { error } = await supabase
  .from('tasks')
  .update({
    body: text,
    task_date: date,
    task_time: time || null,
    priority,
    is_done: done
  })
  .eq('id', taskId);

if (error) throw error;
```

Простой toggle:

```js
await supabase
  .from('tasks')
  .update({ is_done: !task.is_done })
  .eq('id', task.id);
```

Триггер `tasks_set_updated_at` обновит `updated_at` автоматически.

## 9. Удаление задачи

```js
const { error } = await supabase
  .from('tasks')
  .delete()
  .eq('id', taskId);

if (error) throw error;
```

RLS разрешит удаление только строки, принадлежащей текущему пользователю.

## 10. Выход

```js
await supabase.auth.signOut();
location.replace('./index.html');
```

## 11. Переход с локальных данных на Supabase

Порядок следующего этапа:

1. Создать Supabase-проект и выполнить `supabase/schema.sql`.
2. Подключить `@supabase/supabase-js`.
3. Вынести операции в два адаптера: `authRepository` и `taskRepository`.
4. Заменить локальные `register/login/load/persist` на запросы из примеров выше.
5. После первого серверного входа предложить импортировать локальные задачи текущего аккаунта.
6. После подтверждённого импорта удалить локальную копию или оставить её как offline-кэш.

Для устойчивого offline-режима позже можно хранить локальную очередь операций (`insert/update/delete`) и синхронизировать её при восстановлении сети. Сначала разумнее сделать надёжную онлайн-версию, а уже потом приглашать распределённые системы в маленький список дел.
