# SwiftSupport AI Backend - Foundation Module
# Dependencies: fastapi, uvicorn, pydantic, psycopg2-binary, bcrypt, python-jose[cryptography], python-dotenv
# Setup: Add DB_URL, SECRET_KEY to Replit Secrets. Run with uvicorn main:app --host 0.0.0.0 --port $PORT

import os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import logging

load_dotenv()  # Load env vars from .env or Replit Secrets

# Logging setup for debugging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database connection (use Replit's Neon Postgres URL from Secrets)
DB_URL = os.getenv("DATABASE_URL")  # e.g., postgres://user:pass@host/db
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key")  # For JWT
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

app = FastAPI(title="SwiftSupport AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security: JWT Dependency
security = HTTPBearer()

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

# DB Connection Helper with error handling
def get_db_connection():
    try:
        conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        logger.error(f"DB connection error: {e}")
        raise HTTPException(status_code=500, detail="Database connection failed")

# Pydantic Models for Input Validation
class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str = "customer"

class UserLogin(BaseModel):
    username: str
    password: str

class TicketCreate(BaseModel):
    title: str
    description: str
    priority: str = "medium"

class KBArticleCreate(BaseModel):
    title: str
    content: str
    category: str = None

# API Endpoints

@app.post("/users/register", status_code=201)
def register_user(user: UserCreate):
    # Input validation/sanitization (Pydantic handles basics)
    if not (3 <= len(user.username) <= 50):
        raise HTTPException(400, "Username must be 3-50 characters")
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Hash password securely
            hashed_pw = bcrypt.hashpw(user.password.encode('utf-8'), bcrypt.gensalt())
            cur.execute(
                "INSERT INTO users (username, email, password_hash, role) VALUES (%s, %s, %s, %s) RETURNING id",
                (user.username, user.email, hashed_pw.decode('utf-8'), user.role)
            )
            user_id = cur.fetchone()['id']
            conn.commit()
        return {"message": "User created", "user_id": user_id}
    except psycopg2.IntegrityError:
        raise HTTPException(400, "Username or email already exists")
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(500, "Internal server error")
    finally:
        conn.close()

@app.post("/users/login")
def login_user(login: UserLogin):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, password_hash FROM users WHERE username = %s", (login.username,))
            user = cur.fetchone()
            if not user or not bcrypt.checkpw(login.password.encode('utf-8'), user['password_hash'].encode('utf-8')):
                raise HTTPException(401, "Invalid credentials")
            access_token = create_access_token(data={"sub": str(user['id'])})
        return {"access_token": access_token, "token_type": "bearer"}
    finally:
        conn.close()

@app.post("/tickets", status_code=201)
def create_ticket(ticket: TicketCreate, user_id: int = Depends(get_current_user)):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO tickets (user_id, title, description, priority) VALUES (%s, %s, %s, %s) RETURNING id",
                (user_id, ticket.title, ticket.description, ticket.priority)
            )
            ticket_id = cur.fetchone()['id']
            conn.commit()
        return {"message": "Ticket created", "ticket_id": ticket_id}
    finally:
        conn.close()

@app.post("/kb/articles", status_code=201)
def create_kb_article(article: KBArticleCreate, user_id: int = Depends(get_current_user)):
    # Assume only admins/agents can create (add role check in future)
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO knowledge_base (title, content, category) VALUES (%s, %s, %s) RETURNING id",
                (article.title, article.content, article.category)
            )
            article_id = cur.fetchone()['id']
            conn.commit()
        return {"message": "KB article created", "article_id": article_id}
    finally:
        conn.close()

# Basic Health Check
@app.get("/health")
def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="localhost", port=port)
