require("dotenv").config();
const crypto = require('crypto');
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();

const dataBase = require("./dataBase.js");
const orderBase = require("./orderBase.js");

const TOKEN_VEXBOOST= process.env.TOKEN_VEXBOOST; 
const BOT_TOKEN = process.env.BOT_TOKEN;
const URL_BOT = process.env.URL_BOT;

const KF = 1.5;

app.use(cors({ methods: ["GET", "POST"] }));
app.use(express.json());


const SERVICES_TYPE = [ { name: 'Подписчики', type:'followers',  icon: 'assets/followers.svg', targetFunc: 'orderFollowers', amount: 1000 }, { name: 'Просмотры', type:'views', icon: 'assets/views.svg', targetFunc: 'orderViews', amount: 1000 }, { name: 'Реакции', type: 'reactions', icon: 'assets/reactions.svg', targetFunc: 'orderReactions', amount: 1000 }, { name: 'Буст канала', type: 'boosts', icon: 'assets/boost.png', targetFunc: 'orderBoosts', amount: 1 }, { name: 'Звезды', type: 'stars', icon: 'assets/stars.png', targetFunc: 'orderStars', amount: 1000 }, { name: 'Рефералы', type:'referrals', icon: 'assets/referral.svg', targetFunc: 'orderReferrals', amount: 1000 } ]; 


let services = [];
let all_services = {};
let followers, views, reactions, boosts, stars, referrals = [];
 
function getNewService(){
  axios(`https://vexboost.ru/api/v2?action=services&key=${TOKEN_VEXBOOST}`).then(res => {
    services = res.data;
    obj = JSON.parse(JSON.stringify(res.data).replaceAll('vexboost', 'hardboost').replaceAll('VexBoost', 'HardBoost').replaceAll('.ru', '.vercel.app'));

    obj.forEach(item => item.rate = item.rate*KF);
    followers = obj.filter((item) => item.name.includes("одписчик") && item.network === "Telegram").sort((a,b) => a.rate - b.rate);
    views = obj.filter((item) => item.name.includes("росмотр") && item.network === "Telegram").sort((a,b) => a.rate - b.rate);
    reactions = obj.filter( (item) => item.name.includes("еакци") && item.network === "Telegram").sort((a,b) => a.rate - b.rate);
    boosts = obj.filter((item) => item.name.includes("Telegram Буст") && item.network === "Telegram").sort((a,b) => a.rate - b.rate);
    stars = obj.filter((item) => item.name.includes("Telegram Stars")).sort((a,b) => a.rate - b.rate);
    referrals = obj.filter((item) => (item.category.includes("Старты бота") || item.category.includes("Рефералы"))).sort((a,b) => a.rate - b.rate);  

    all_services = { followers, views, reactions, boosts, stars, referrals } ;
  });
}


getNewService();

setInterval(getNewService,(1000*60*60)*60 );






// orderBase.find({ completed: false }).then((res) => { 
//   console.log(res)
// })

function updateOrdersConnect(id) {
  console.log('updateOrdersConnect');
  orderBase.find({ customer: id, completed: false, ready:true }).then((res) => {
    res.forEach((item) => {
      axios(`https://vexboost.ru/api/v2?action=status&order=${item.order}&key=${TOKEN_VEXBOOST}`).then((order) => {  
        console.log(item);
      });
    });
  });
}



function updateOrders() {
  orderBase.find({ completed: false, ready:true }).then((res) => {
    res.forEach((item) => {
      // https://vexboost.ru/api/v2?action=services&key=${TOKEN_VEXBOOST}
      // https://optsmm.ru/api/v2?action=status&order=${item.order}&key=${OPTSMM_KEY}
      axios(
        `https://vexboost.ru/api/v2?action=status&order=${item.order}&key=${TOKEN_VEXBOOST}`
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
//updateOrders()
setInterval(() => {
  //updateOrders();
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


app.post('/api/auth', async (req, res) => {
  const { initData = null } =  req.body;
  const answer = await verifyTelegramInitData(initData);

  if(answer.isVerify){
    const { first_name, username, id, language_code } = answer.user;
    dataBase.findOne({ id }).then(user => {
      if(user){
        res.send({ user, services: all_services});
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
        res.send({ user: createUser, services: all_services });
      }  
    })
  }
  else{
    res.status(401).send({ msg: 'Ошибка авторизации!'})
  }
});

app.post('/api/my-orders', async (req, res) => {
  const { initData = null } =  req.body
  const answer = await verifyTelegramInitData(initData);

  if(answer.isVerify){
    const { id } = answer.user;
    orderBase.find({ customer: id }).then(orders => {
      updateOrdersConnect(id);
      res.send({ orders, services});
    });
  }
  else{
    res.status(401).send({ msg: 'Ошибка авторизации!'})
  }
});



// https://t.me/trustvpn_official_bot?start=R1768954217963

app.post('/api/create-order', async (req, res) => {
  const { initData = null, url, amount, pay, service } =  req.body
  const answer = await verifyTelegramInitData(initData);

  const type = typeOrder(service);

    console.log(type, service);


  if(answer.isVerify){
    const { id } = answer.user;
    dataBase.findOne({ id }).then(user => {
      if(user){
        const currentService = services.filter((item) => item.service === service)[0];
        const currentPay = (currentService.rate/type.amount)*amount;
 
        if (currentPay <= user.balance && currentService.min <= amount && currentService.max >= amount) {  
          axios(`https://vexboost.ru/api/v2?action=add&service=${service}&link=${url}&quantity=${amount}&key=${TOKEN_VEXBOOST}`).then(order => { 
            dataBase.updateOne({ id: id }, { $inc : { balance: -currentPay }});
            orderBase.insertOne({
              id: refCode(),
              customer: id,
              service: service,
              amount: amount,
              price: currentPay,
              url: url,
              ready: true,
              completed: false,
              order: order.data.order,
              date: dateNow()
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
  }
  else{
    res.status(401).send({ msg: 'Ошибка авторизации!'})
  }

 
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




// app.post('/followers', async (req, res) => {
//   res.send(followers);
// });

// app.post('/views', async (req, res) => {
//   res.send(views);
// });

// app.post('/reactions', async (req, res) => {
//   res.send(reactions);
// });

// app.post('/boosts', async (req, res) => {
//   res.send(boosts);
// });

// app.post('/stars', async (req, res) => {
//   res.send(stars);
// });

// app.post('/referrals', async (req, res) => {
//   res.send(referrals);
// });





function refCode(n = 6) {
  const symbols = "QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm1234567890";
  let user_hash = "";
  for (let i = 0; i != n; i++) {
    user_hash += symbols[Math.floor(Math.random() * symbols.length)];
  }
  return user_hash;
}

function dateNow() {
  return new Date().getTime();
}
async function verifyTelegramInitData(initData) {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get("hash");
  urlParams.delete("hash");
  const user = JSON.parse(urlParams.get("user"));
  const dataCheckString = Array.from(urlParams.entries()).map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return { isVerify: hmac === hash, user } ;
}

function typeOrder(service){
  console.log(service);
  for(const key in all_services){
    if(all_services.hasOwnProperty(key)){
      const arr = all_services[key].filter(item => item.service === service);
      if(arr.length != 0){
        return SERVICES_TYPE.find(item => item.type === key);
      }
    }
  }
}


app.listen(3001, (err) => {
  err ? err : console.log("STARTED SERVER");
});
