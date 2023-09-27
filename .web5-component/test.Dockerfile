FROM node:18-alpine
RUN ["npm", "install", "-g", "npm@latest", "typescript"]
ADD . /web5-js
WORKDIR /web5-js
RUN npm ci
RUN tsc --target es6 --moduleResolution nodenext --module NodeNext --esModuleInterop .web5-component/main.ts
CMD ["node", ".web5-component/main.js"]
