# ZOO

Sala de conversa anônima com visual retrô preto e laranja.

## Rodar localmente

```bash
npm start
```

Abra `http://localhost:5500`.

## Usar Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra o SQL Editor e execute [`supabase/schema.sql`](supabase/schema.sql).
3. Em Project Settings > API, copie a Project URL e a chave `anon`.
4. Preencha esses valores em [`supabase-config.js`](supabase-config.js).
5. Publique os arquivos em GitHub Pages, Vercel ou Netlify.

Para apagar todas as mensagens automaticamente às 04:00 em Brasília, execute [`supabase/schedule-cleanup.sql`](supabase/schedule-cleanup.sql) uma vez no SQL Editor. O agendamento usa 07:00 UTC.

A chave `anon` pode aparecer no frontend quando as políticas RLS estiverem ativas. Nunca publique a chave `service_role`.

Sem configuração do Supabase, o projeto continua funcionando localmente usando `server.js` e `data/zoo-messages.json`.
