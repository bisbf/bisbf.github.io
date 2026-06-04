Bisbf forum

-- All types of data uploaded are stored locally by default.
-- No login system or moderation queue.
--

Remote sync

This site can sync across devices when using Firebase Realtime Database.

1. Go to https://console.firebase.google.com/
2. Create a new project.
3. Open Realtime Database and create a database.
4. Choose a location and select "Start in test mode".
5. Copy the database URL such as:

   `https://your-project-id-default-rtdb.firebaseio.com/bisbf-forum.json`

6. Open Database rules and use this for a demo:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

7. In `app.js`, set `REMOTE_DB_URL` to the URL above.

After that, posts and replies will be shared between devices using Firebase. For production, tighten the database rules and add authentication.
