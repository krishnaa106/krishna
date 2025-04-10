* RUN THIS COMMAND 

```
git clone https://github.com/manjisama1/LIXON
cd LIXON
npm install
``` 
if error use this
```
npm install --legacy-peer-deps
``` 

* MAKE A config.env FILE AND ADD THESE KEYS AND VALUES (CHANGE THE VALUES)

```
PREFIX=.
STICKER_PACK=🔫,manji<3
SUDO=null,994407542875
BOT_MODE=private
RMBG_API_KEY=null
PIN_API=http://localhost:3000/scrape
GIT_REPO=https://github.com/manjisama1/LIXON
GIT_BRANCH=https://github.com/manjisama1/LIXON/tree/main
```

* RUN THIS TO START THE BOT

```
npm start
```

* IF ANY ERROR / YOU DON'T HAVE PM2

install pm2 globaly
```
npm install -g pm2

```
then run this
```
npm start
```
or
```
pm2 start ./lib/client.js --name lixon
```

* THEN ENTER NUMBER AND NOTE DOWN THE CODE AND USE IT IN LINK DEVICE.