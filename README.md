# Linear Agent Demo

A demonstration of building AI agents that interact with Linear issues using OpenAI. This project showcases how to build intelligent agents that can respond to mentions and perform research tasks within Linear.

This is demoware and should _not_ be used in production. Be careful!

## 🚀 Quick Start

This project uses [`mise`](https://mise.jdx.dev/) for managing development tools and environment variables. Make sure you have it installed first.

```bash
# Install mise if you haven't already
curl https://mise.run | sh

# Setup your development environment
mise install

# Add local domain to hosts file (requires sudo)
echo "127.0.0.1 linear.agent" | sudo tee -a /etc/hosts

# Start the development server
mise run dev
```

## 📁 Project Structure

The most important directory to look at is `src/agents/`. This is where all the Linear agents are defined:

- `ResearchAgent.ts`: An AI agent that responds to mentions in Linear issues by performing research using GPT-4 and web search capabilities.

## 🔧 Available Tasks

All tasks are managed through `mise`:

- `mise run dev` - Start the development server with debug logging
- `mise run start` - Start the production server
- `mise run generate-certs` - Generate SSL certificates for local development
- `mise run db:generate` - Generate database schemas
- `mise run db:migrate` - Run database migrations

## 🔐 Environment Setup

The project uses a `.env` file for configuration. The `mise run setup` will copy the `.env.example` to `.env`. You'll just need to fill in the values. All environment variables above are required for the application to function properly. You can obtain the Linear credentials by creating a Linear OAuth application in your workspace settings.

Environment variables are validated in [`src/lib/env.ts`](src/lib/env.ts).

## 🔑 Authentication

This project uses [`better-auth`](https://github.com/better-auth/better-auth) for handling the OAuth flow with Linear. 

## 🔒 Security Note

This project uses self-signed certificates for local development. 

