require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();

const dataBase = require("./dataBase.js");
const orderBase = require("./orderBase.js");
const OPTSMM_KEY = process.env.OPTSMM_KEY;
const URL_BOT = process.env.URL_BOT;

const KF = 1.5;

app.use(cors({ methods: ["GET", "POST"] }));
app.use(express.json());


let services = [];

let followers = services.filter((item) => item.category === "Telegram");
let views = services.filter((item) => item.name.includes("росмотр") && item.category === "Telegram реакции/просмотры");
let reactions = services.filter((item) => item.name.includes("еакци") && item.category === "Telegram реакции/просмотры");
let boosts = services.filter((item) => item.category === "Telegram Boost");
let stars = services.filter((item) => item.name === "Telegram Stars на Аккаунт");


axios(`https://optsmm.ru/api/v2?action=services&key=${OPTSMM_KEY}`).then(res => { 
  services = res.data;
  services.forEach(item => item.rate = item.rate*KF);
  followers = services.filter((item) => item.category === "Telegram");
  views = services.filter((item) => item.name.includes("росмотр") && item.category === "Telegram реакции/просмотры");
  reactions = services.filter((item) => item.name.includes("еакци") && item.category === "Telegram реакции/просмотры");
  boosts = services.filter((item) => item.category === "Telegram Boost");
  stars = services.filter((item) => item.name === "Telegram Stars на Аккаунт");
});





// orderBase.find({ completed: false }).then((res) => { 
//   console.log(res)
// })


function updateOrders() {
  orderBase.find({ completed: false, ready:true }).then((res) => {
    res.forEach((item) => {
      axios(
        `https://optsmm.ru/api/v2?action=status&order=${item.order}&key=${OPTSMM_KEY}`
      ).then((order) => {
        const { status } = order.data;
        if (status != "In progress" && status != "Awaiting") {
          if (status == "Partial") {
            const payBack = (item.price / item.amount) * order.data.remains * 1;
            axios.post(
              `${URL_BOT}/send-user`,
              {
                id: item.customer,
                msg: `<b>🎉 Ваш заказ был выполнен частично #${item.id}</b>
<blockquote><b>💸 Вам возвращено:</b> ${payBack.toFixed(2)}₽</blockquote>`,
              },
              { headers: { "Content-Type": "application/json" } }
            );

            dataBase.updateOne(
              { id: item.customer },
              { $inc: { balance: payBack } }
            );
            orderBase.updateOne({ id: item.id }, { $set: { completed: true } });
          } else if (status == "Completed") {
            axios.post(`${URL_BOT}/send-user`, {id: item.customer, msg:`<b>🎉 Ваш заказ был полностью выполнен #${item.id}</b>`}, {  headers: { 'Content-Type':'application/json' } })
            orderBase.updateOne({ id: item.id }, { $set: { completed: true } });
          } else if (status == "Canceled") {
            axios.post(
              `${URL_BOT}/send-user`,
              {
                id: item.customer,
                msg: `<b>❌ Ваш заказ был отменен #${item.id}</b>
<blockquote><b>💸 Вам возвращено:</b> ${item.price}₽</blockquote>
    `,
              },
              { headers: { "Content-Type": "application/json" } }
            );

            dataBase.updateOne(
              { id: item.customer },
              { $inc: { balance: item.price } }
            );
            orderBase.updateOne({ id: item.id }, { $set: { completed: true } });
          }
        }
      });
    });
  });
}
updateOrders()
setInterval(() => {
  updateOrders();
}, 1000*60*10);


app.post("/pay", async (req, res) => {
  const update = req.body;
  console.log(req.body);
  if (update.update_type === "invoice_paid") {
    console.log("💸 Оплата прошла!");
    const invoice = update.payload;
    const currentAmount = update.payload.amount * 1;
    orderBase.findOne({ invoice_id: invoice.invoice_id }).then((res_2) => {
      if (res_2) {
        axios.post(
          `${URL_BOT}/send-user`,
          {
            id: res_2.id,
            msg: `<b>🎉 Ваш чек #${invoice.invoice_id}</b>
<blockquote><b>💸 Вам начисленно:</b> ${currentAmount}₽</blockquote>
    `,
          },
          { headers: { "Content-Type": "application/json" } }
        );
        dataBase.updateOne(
          { id: res_2.id },
          { $inc: { balance: currentAmount } }
        );
      }
    });
  }

  res.send({ message: "Hello World" });
});

app.get("/sleep", async (req, res) => {
  res.send({ type: 200 });
});


app.post('/app', async (req, res) => {
  const { first_name, username, id, language_code } =  req.body
  dataBase.findOne({ id }).then(user => {
    if(user){
      res.send(user);
    }
    else{
      const createUser = {
        id,
        first_name,
        username,
        language_code,
        referrals: 0,
        bonus: true,
        ref_code: refCode(),
        prefer: 0,
        date: dateNow(),
        balance: 0,
      }
      dataBase.insertOne(createUser);
      res.send(createUser);
      console.log('CREATE USER')
    }
    
  })
});

app.post('/my-orders', async (req, res) => {
  const { id } =  req.body
  orderBase.find({ customer: id, completed: false }).then(orders => {
    if(orders){
      res.send({ orders, services});
    }
    else{
      res.send({ orders, services});
    }
    
  })
});




app.post('/create-order', async (req, res) => {
  const { id, url, amount, pay, service   } =  req.body
  console.log(req.body)
  dataBase.findOne({ id }).then(user => {
    if(user){
      const currentService = services.filter((item) => item.service === service)[0];
      const currentPay = (currentService.rate/1000)*amount;
      const idOrder = refCode();
      console.log(url.includes("https://t.me/"), currentPay <= user.balance ,
      currentService.min <= amount, currentService.max >= amount);
 
      if (url.includes("https://t.me/") && currentPay <= user.balance &&
      currentService.min <= amount && currentService.max >= amount) {
        
          
          axios(`https://optsmm.ru/api/v2?action=add&service=${service}&link=${url}&quantity=${amount}&key=${OPTSMM_KEY}`)
          .then(optsmm => { 
            dataBase.updateOne({ id: id }, { $inc : { balance: -currentPay }});
            orderBase.insertOne({
              id: idOrder,
              customer: id,
              service: service,
              amount: amount,
              price: currentPay,
              url: url,
              ready: true,
              completed: false,
              order: optsmm.data.order
            });
          });
          res.send({ type: 'create', msg: 'Успешно создан'});
      }
      else{
        res.send({ type: 'rmv', msg: 'Непрошли проверку'});
      }
    }
    else{
      res.send({ type: 'rmv', msg: 'Аккаунт не найден'});
    }
    
  })
});
app.post('/create-order-boost', async (req, res) => {
  const { id, url, amount, pay, service   } =  req.body
  console.log(req.body)
  dataBase.findOne({ id }).then(user => {
    if(user){
      const currentService = services.filter((item) => item.service === service)[0];
      const currentPay = (currentService.rate)*amount;
      const idOrder = refCode();
      console.log(url.includes("https://t.me/"), currentPay <= user.balance ,
      currentService.min <= amount, currentService.max >= amount);
 
      if (url.includes("https://t.me/") && currentPay <= user.balance &&
      currentService.min <= amount && currentService.max >= amount) {
        
          
          axios(`https://optsmm.ru/api/v2?action=add&service=${service}&link=${url}&quantity=${amount}&key=${OPTSMM_KEY}`)
          .then(optsmm => { 
            dataBase.updateOne({ id: id }, { $inc : { balance: -currentPay }});
            orderBase.insertOne({
              id: idOrder,
              customer: id,
              service: service,
              amount: amount,
              price: currentPay,
              url: url,
              ready: true,
              completed: false,
              order: optsmm.data.order
            });
          });
          res.send({ type: 'create', msg: 'Успешно создан'});
      }
      else{
        res.send({ type: 'rmv', msg: 'Непрошли проверку'});
      }
    }
    else{
      res.send({ type: 'rmv', msg: 'Аккаунт не найден'});
    }
    
  })
});



app.get('/all-users', async (req, res) => {
  dataBase.find({ }).then((res_1) => {
    res.send(res_1)
  });
});

app.get('/all-orders', async (req, res) => {
  orderBase.find({ }).then((res_1) => {
    res.send(res_1)
  });
});




app.post('/followers', async (req, res) => {
  res.send(followers);
});

app.post('/views', async (req, res) => {
  res.send(views);
});

app.post('/reactions', async (req, res) => {
  res.send(reactions);
});

app.post('/boosts', async (req, res) => {
  res.send(boosts);
});

app.post('/stars', async (req, res) => {
  res.send(stars);
});


function refCode(n = 6) {
  const symbols =
    "QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm1234567890";
  let user_hash = "";
  for (let i = 0; i != n; i++) {
    user_hash += symbols[Math.floor(Math.random() * symbols.length)];
  }
  return user_hash;
}

function dateNow() {
  return new Date().getTime();
}

app.listen(3001, (err) => {
  err ? err : console.log("STARTED SERVER");
});
