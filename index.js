const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const {Client}= require('@elastic/elasticsearch');
// const { match } = require('assert');

require('dotenv').config();


const app = express();
const esClient = new Client({ node: `http://${process.env.DB_HOST}:9200` });

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port:process.env.DB_PORT,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  authPlugins: {
    mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0'),
  },
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
  } else {
    console.log('Connected to MySQL database');
  }
});

app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'category.html'));
});
app.get('/category/data', (req, res) => {
  db.query('SELECT * FROM category', (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }
    res.json(results);
  });
});

app.get('/category', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'product.html'));
});
app.get('/category/type', async (req, res) => {
  var categoryId = req.query.id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = 10;
  var startIndex = (page - 1) * limit;
  var endIndex = page * limit;  
  // console.log(startIndex,endIndex)
  db.query('SELECT * FROM products WHERE cid= ? ORDER BY id',[categoryId], (err, data) => {
    var results = {};
    // console.log(data.length)
    if(endIndex>=data.length){
      endIndex=data.length;
    } 
    if (endIndex <= data.length) {
      if (startIndex > 0) 
        results.prev = page-1;
      if (endIndex < data.length) 
        results.next = page + 1;
    }
    results.len=Math.ceil(data.length/10);
    results.results = data.slice(startIndex, endIndex);
    // console.log(results.results)
    res.paginatedResults = results;
    res.json(res.paginatedResults);
  });
});

app.get('/all-products', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'all-products.html'));
});
app.get('/all-products/data', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    // const limit = 10;
    var startIndex = (page - 1)*10;
    var endIndex = page*10;  
    
  db.query('SELECT * FROM products',(err,data) => {
      var results = {};
      if(endIndex>=data.length){
        endIndex=data.length;
      } 
      if (endIndex <= data.length) {
        if (startIndex >= 0) 
          results.prev = page-1;
        if (endIndex < data.length) 
          results.next = page + 1;
      }
      const uniqueCategories = [...new Set(data.map(data => data.category))];
      results.uniqueCategories=uniqueCategories;
      results.len=Math.ceil(data.length/10);
      results.results = data.slice(startIndex, endIndex);
      res.paginatedResults = results;
      res.json(res.paginatedResults);
    });
  }
  catch (err) {
    console.error('Error in /all-products route:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/results', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'search.html'));
});

app.get('/results/data', async (req, res) => {
  var query = req.query.query;
  var up=["under","below","less","within","down","lesser"];
  var down=["over","above","greater","up",];
  var extra=[",",".","/",":","[","]","@","rs","Rs","amt","Amt","+","-","than"];

  var string=query.split(" ")
  var cur,sort;

  extra.forEach(val=>{
    if(query.includes(val)){
      query=query.replace(val,"");
    }
  })

  string.forEach(val => {
    if(up.includes(val)){
      cur=val;
      sort="lte";
      console.log(sort);
      return;
    }
    else if(down.includes(val)){
      cur=val;
      sort="gte";
      console.log(sort);
      return;
    }
    // else{
    //   sort="lte";
    //   return;
    // }
  });

  console.log(query);
  console.log(sort)
  if(cur){
    var [data,price] = query.split(cur);
    var value=parseFloat(price);
  }
  else{
    var data=query;
    var value=10000000;
    sort="lte";
  }
  try {
    let body  = await esClient.search({
        index: "product_table",
        body: {
          query: {
            bool: {
              must: [
                {
                  exists: {
                    field: "discount_price"
                  }
                },
                {
                  range: {
                    discount_price: {
                      [sort]: value
                    }
                  }
                }
              ],
              should: [
                {
                  multi_match: {
                    query: data,
                    fields: ["brand", "name", "category"],
                    // fuzziness: "1"
                  }
                }
              ],
              minimum_should_match: 1
            }
          },
        // }      
        _source:['id','name','cid','category','brand','mrp','discount_price','stock'],
      }
    });
    // console.log(body)
    if (body && body.hits) {
      let data=body.hits.hits;
      const results = data.map(hit => hit._source);
      // console.log(results);
      res.json(results);
    } else {
      console.error('Invalid Elasticsearch response:', body);
      res.status(500).send('Invalid Elasticsearch response');
    }
    } catch (error) {
      console.error(error);
      res.status(500).send('Internal Server Error');
    }
});

app.listen(8080, () => {
  console.log(`Listening to http://${process.env.DB_HOST}:8080/home`);
});
  