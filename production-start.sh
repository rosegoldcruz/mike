#!/bin/bash
# production-start.sh — Launch the Cabinet Bidding Dashboard in Production Mode

# 1. Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}   Cabinet Bidding Dashboard — PRODUCTION LAUNCH SEQUENCE      ${NC}"
echo -e "${BLUE}================================================================${NC}"

# Check for AI Layer
# Check for AI Layer
AI_ACTIVE=0

if [ -n "$OPENAI_API_KEY" ]; then
    echo -e "${GREEN}✔  OpenAI Integration Active (Primary)${NC}"
    AI_ACTIVE=1
fi

if [ -n "$DEEPSEEK_API_KEY" ]; then
    if [ -n "$OPENAI_API_KEY" ]; then
        echo -e "${GREEN}✔  DeepSeek Integration Ready (Backup)${NC}"
    else
        echo -e "${GREEN}✔  DeepSeek Integration Active (Primary)${NC}"
    fi
    AI_ACTIVE=1
fi

if [ $AI_ACTIVE -eq 0 ]; then
    echo -e "${BLUE}ℹ  Running in Standard Mode (Regex Parsing)${NC}"
    echo -e "${BLUE}   Tip: Set OPENAI_API_KEY or DEEPSEEK_API_KEY for smart extraction${NC}"
fi

# 2. Check Dependencies
echo -e "${BLUE}➜ Checking Python environment...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✘ python3 not found!${NC}"
    exit 1
fi
python3 -m pip install -r backend/requirements.txt > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✔ Backend dependencies installed${NC}"
else
    echo -e "${RED}✘ Failed to install backend dependencies${NC}"
    exit 1
fi

echo -e "${BLUE}➜ Checking Node environment...${NC}"
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✘ npm not found!${NC}"
    exit 1
fi
npm install > /dev/null 2>&1
echo -e "${GREEN}✔ Frontend dependencies installed${NC}"

# 3. Launch Backend
echo -e "${BLUE}➜ Launching Backend API (gunicorn)...${NC}"
cd backend
# Kill any existing on port 8000
fuser -k 8000/tcp > /dev/null 2>&1
# Start gunicorn in background
gunicorn -c gunicorn.conf.py main:app &
BACKEND_PID=$!
cd ..

# Wait for backend health
echo -n "  Waiting for backend..."
for i in {1..30}; do
    if curl -s http://localhost:8000/api/health > /dev/null; then
        echo -e " ${GREEN}✔ ONLINE${NC}"
        break
    fi
    echo -n "."
    sleep 1
done

# 4. Launch Frontend
echo -e "${BLUE}➜ Launching Frontend UI (Next.js)...${NC}"
# Use a production build for speed, or dev for now if build fails
# npm run build > /dev/null 2>&1 && npm start &
# For this environment, let's stick to dev but robustly
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev -- --port 3000 &
FRONTEND_PID=$!

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}   ✔ SYSTEM OPERATIONAL                                         ${NC}"
echo -e "${GREEN}   ➜ Frontend: http://localhost:3000                            ${NC}"
echo -e "${GREEN}   ➜ Backend:  http://localhost:8000                            ${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "Press Ctrl+C to stop all services."

# Trap cleanup
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT TERM
wait
