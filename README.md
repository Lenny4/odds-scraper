# OrbitX Scrapper - README

## Usage

### Pour Ubuntu 22 ou supérieur

Si vous utilisez Ubuntu 22 ou une version plus récente, suivez ces étapes pour activer le support X11 avec Docker :

1. Modifiez la configuration de GDM :

   ```bash
   sudo nano /etc/gdm3/custom.conf
   ```

2. Décommentez la ligne suivante :

   ```bash
   WaylandEnable=false
   ```

3. Redémarrez votre système.

   Référence : [AskUbuntu](https://askubuntu.com/a/1407496/1170749)

### Lancer en mode développement

```bash
docker rm -v -f $(docker ps -a -q)
xhost + && docker compose -f docker-compose.yml -f docker-compose.dev.yml up
./src/React/runc npm install [packageName]
```

### Lancer en mode production

1. Démarrez les conteneurs en arrière-plan :

   ```bash
   docker compose up -d
   ```

2. Dans un autre terminal, lancez le monitoring avec PM2 :

   ```bash
   ./runc pm2 monit
   docker logs odds-scraper-node-1 --follow
   ```

3. Si tu vois l'erreur `0 application online, retry = 3` c'est probablement max_memory_restart dans ecosystem.config.js

---

### **Calcul d'un Surebet entre Bookmaker et Betting Exchange**

$$
\begin{align*}
\text{comm} &: \text{commission de l'exchange (ex. } 0.97 \text{)} \\
m_1 &: \text{mise bookmaker} \\
c_1 &: \text{cote bookmaker} \\
m_2 &: \text{mise betting exchange (lay)} \\
c_2 &: \text{lay cote betting exchange} \\
g &: \text{gain net} \\
\\
\text{Calcul de la mise sur l'exchange:} \quad
m_2 &= \frac{m_1}{\text{comm}} \\
\\
\text{Condition de surebet:} \quad
c_2 &\leq \left[ (c_1 - 1) \cdot \text{comm} + 1 \right] \\
\\
\text{Si le coureur gagne:} \quad
g &= m_1 \cdot (c_1 - 1) - m_2 \cdot (c_2 - 1) \\
\\
\text{Si le coureur perd:} \quad
g &= m_2 - m_1
\end{align*}
$$



