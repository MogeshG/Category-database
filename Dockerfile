FROM node:20

COPY . /app

WORKDIR /app

COPY package*.json ./

RUN npm install

ENV ELASTICSEARCH_HOST http://192.168.1.68:9200


EXPOSE 8080

CMD ["node","index.js"]