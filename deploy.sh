#!/bin/bash

# AIOJIM2 VPS Deployment Script
# Gebruik: ./deploy.sh

set -e

echo "🚀 AIOJIM2 VPS Deployment Script"
echo "================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "✅ Docker installed. Please log out and back in, then run this script again."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Installing..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p data logs ssl

# Set permissions
echo "🔐 Setting permissions..."
sudo chown -R 1000:1000 data logs

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOF
# AIOJIM2 Environment Configuration
HOST_NAME=http://your-domain.com:1337
PORT=1337
DATABASE_URI=sqlite://data/db.sqlite
ENABLE_CACHE_WARMING=false
NO_CACHE=false
TMDB_API_KEY=YOUR_TMDB_API_KEY
TVDB_API_KEY=YOUR_TVDB_API_KEY
REDIS_URL=redis://redis:6379
EOF
    echo "⚠️  Please edit .env file with your actual API keys and domain!"
    echo "   - Replace YOUR_TMDB_API_KEY with your TMDB API key"
    echo "   - Replace YOUR_TVDB_API_KEY with your TVDB API key"
    echo "   - Replace your-domain.com with your actual domain"
    read -p "Press Enter when you've updated the .env file..."
fi

# Pull latest images
echo "📥 Pulling latest Docker images..."
docker-compose pull

# Start services
echo "🚀 Starting AIOJIM2 services..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check if services are running
echo "🔍 Checking service status..."
docker-compose ps

# Show logs
echo "📋 Recent logs:"
docker-compose logs --tail=20

echo ""
echo "✅ AIOJIM2 is now running!"
echo "🌐 Configure interface: http://your-domain.com/configure"
echo "📊 Addon URL: http://your-domain.com/stremio/"
echo ""
echo "📝 Useful commands:"
echo "   View logs: docker-compose logs -f"
echo "   Stop: docker-compose down"
echo "   Restart: docker-compose restart"
echo "   Update: docker-compose pull && docker-compose up -d"
