# Sharing The Kayak Trip Website

## Temporary sharing

A temporary public link can be created from your computer. It works only while:

- this computer is awake,
- the local website server is running,
- the public tunnel is running.

Because this exposes the sign-up form and admin login to the internet, use a strong admin PIN before sharing.

## Permanent sharing

For a real link that anyone can use even when your computer is off, deploy this folder to a hosting provider that can run Docker and keep a small persistent disk.

Recommended setup:

1. Create an account at Render.
2. Create a new web service from this project.
3. Use Docker as the environment.
4. Add an environment variable named `ADMIN_PIN` with a private passcode.
5. Keep the persistent disk mounted at `/app/data`.

The included `render.yaml` already describes the service, port, admin PIN variable, and data disk.

## Important

Do not share the default admin PIN. Change it before sending the link to other people.
