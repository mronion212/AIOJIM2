# AIOJIM2 VPS Deployment Guide

## 🚀 Snelle Start

### 1. VPS Voorbereiding
```bash
# Update je VPS
sudo apt update && sudo apt upgrade -y

# Installeer Docker (als nog niet geïnstalleerd)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Installeer Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log uit en weer in om Docker groep te activeren
```

### 2. AIOJIM2 Downloaden
```bash
# Clone de repository
git clone https://github.com/mronion212/AIOJIM2.git
cd AIOJIM2

# Of download de bestanden direct
wget https://github.com/mronion212/AIOJIM2/archive/main.zip
unzip main.zip
cd AIOJIM2-main
```

### 3. Configuratie
```bash
# Maak directories aan
mkdir -p data logs ssl

# Stel permissions in
sudo chown -R 1000:1000 data logs

# Kopieer en bewerk .env file
cp .env.example .env
nano .env
```

**Bewerk de .env file:**
```env
HOST_NAME=http://jouw-domain.com:1337
PORT=1337
DATABASE_URI=sqlite://data/db.sqlite
ENABLE_CACHE_WARMING=false
NO_CACHE=false
TMDB_API_KEY=jouw_tmdb_api_key
TVDB_API_KEY=jouw_tvdb_api_key
REDIS_URL=redis://redis:6379
```

### 4. Starten
```bash
# Start alle services
docker-compose up -d

# Controleer status
docker-compose ps

# Bekijk logs
docker-compose logs -f
```

## 🔧 Geavanceerde Configuratie

### Nginx Reverse Proxy
De `nginx.conf` is al geconfigureerd met:
- Rate limiting (10 req/s voor API, 5 req/s voor metadata)
- Security headers
- Caching voor metadata
- Health checks

### SSL/HTTPS Setup
1. Verkrijg SSL certificaten (Let's Encrypt):
```bash
# Installeer Certbot
sudo apt install certbot

# Verkrijg certificaat
sudo certbot certonly --standalone -d jouw-domain.com

# Kopieer certificaten
sudo cp /etc/letsencrypt/live/jouw-domain.com/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/jouw-domain.com/privkey.pem ssl/key.pem
sudo chown 1000:1000 ssl/*
```

2. Uncomment de HTTPS sectie in `nginx.conf`
3. Herstart services: `docker-compose restart`

### Firewall Configuratie
```bash
# Open poorten
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 1337  # Alleen voor directe toegang
sudo ufw enable
```

## 📊 Monitoring & Onderhoud

### Logs Bekijken
```bash
# Alle logs
docker-compose logs -f

# Alleen AIOJIM2 logs
docker-compose logs -f aiojim2

# Alleen Redis logs
docker-compose logs -f redis
```

### Updates
```bash
# Pull nieuwe versies
docker-compose pull

# Herstart met nieuwe versies
docker-compose up -d

# Of specifieke service
docker-compose up -d aiojim2
```

### Backup
```bash
# Backup database en config
tar -czf aiojim2-backup-$(date +%Y%m%d).tar.gz data/ logs/ .env

# Restore
tar -xzf aiojim2-backup-YYYYMMDD.tar.gz
```

## 🐛 Troubleshooting

### Services Starten Niet
```bash
# Check logs
docker-compose logs

# Check resources
docker stats

# Restart alles
docker-compose down && docker-compose up -d
```

### Performance Problemen
```bash
# Check Redis memory
docker exec aiojim2-redis redis-cli info memory

# Check container resources
docker stats aiojim2

# Verhoog Redis memory in docker-compose.yml
```

### API Keys Niet Werken
1. Controleer .env file
2. Herstart services: `docker-compose restart`
3. Check logs voor API errors

## 🌐 Stremio Configuratie

### Addon URL
```
http://jouw-domain.com/stremio/
```

### Configure Interface
```
http://jouw-domain.com/configure
```

### Stremio Addon Installatie
1. Open Stremio
2. Ga naar Add-ons
3. Klik "Install from URL"
4. Voer in: `http://jouw-domain.com/stremio/manifest.json`

## 📈 Performance Tips

1. **Redis Memory:** Verhoog `maxmemory` in docker-compose.yml
2. **Caching:** Zet `NO_CACHE=false` voor betere performance
3. **Rate Limiting:** Pas aan in nginx.conf naar behoefte
4. **Monitoring:** Gebruik `docker stats` om resources te monitoren

## 🔒 Security

- Gebruik altijd HTTPS in productie
- Stel een sterke firewall in
- Update regelmatig Docker images
- Monitor logs voor verdachte activiteit
- Gebruik environment variabelen voor gevoelige data

## 📞 Support

- GitHub Issues: https://github.com/mronion212/AIOJIM2/issues
- Docker Hub: https://github.com/mronion212/AIOJIM2/pkgs/container/aiojim2
