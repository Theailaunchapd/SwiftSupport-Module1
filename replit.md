# SwiftSupport AI

## Overview
SwiftSupport AI is a customer support ticketing system with a React frontend and Python FastAPI backend.

## Project Structure
- `frontend/` - React + Vite + TypeScript + Tailwind CSS application
- `backend/` - FastAPI Python backend with PostgreSQL database

## Running the Application
- **Frontend**: Runs on port 5000 using Vite dev server
- **Backend**: Runs on port 8080 using Uvicorn

## Database
Uses PostgreSQL with the following tables:
- `users` - User accounts with roles (admin, agent, customer)
- `tickets` - Support tickets
- `knowledge_base` - Knowledge base articles

## API Endpoints
- `POST /users/register` - Register a new user
- `POST /users/login` - Login and get JWT token
- `POST /tickets` - Create a new ticket (requires auth)
- `POST /kb/articles` - Create knowledge base article (requires auth)
- `GET /health` - Health check

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (auto-configured by Replit)
- `SECRET_KEY` - JWT signing secret (optional, has default)
