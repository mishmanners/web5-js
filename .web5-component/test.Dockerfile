FROM node:18-alpine
RUN ["npm", "install", "-g", "npm@latest", "typescript"]
ADD . /web5-js
WORKDIR /web5-js
RUN npm ci
RUN npm run build
RUN tsc -p .web5-component/tsconfig.json
CMD ["node", ".web5-component/main.js"]
