require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();

const dataBase = require("./dataBase.js")
const orderBase = require("./orderBase.js")
const OPTSMM_KEY= process.env.OPTSMM_KEY;
const URL_BOT = process.env.URL_BOT;


app.use(cors({ methods: ["GET", "POST"] }));
app.use(express.json());


orderBase.find({ completed: false }).then(res => {
  res.forEach(item =>{
  axios(`https://optsmm.ru/api/v2?action=status&order=${item.order}&key=${OPTSMM_KEY}`)
  .then(order => {
    const { status } = order.data;
     if(status != 'In progress' && status != 'Awaiting'){
       if(status == 'Partial'){
          const payBack = (item.price/item.amount)*order.data.remains*1;
          axios.post(`${URL_BOT}/send-user`, {
            id: item.customer,
            msg:`<b>🎉 Ваш заказ был выполнен частично #${item.id}</b>
<blockquote><b>💸 Вам возвращено:</b> ${payBack.toFixed(2)}₽</blockquote>`},
            {  headers: { 'Content-Type':'application/json' } })

          dataBase.updateOne({ id: item.customer }, { $inc: { balance: payBack }});
          orderBase.updateOne({ id: item.id }, { $set: { completed: true }});
       }
       else if(status == 'Completed'){
         //axios.post(`${URL_BOT}/send-user`, {id: item.customer, msg:`<b>🎉 Ваш заказ был выполнен #${item.id}</b>`}, {  headers: { 'Content-Type':'application/json' } })
         orderBase.updateOne({ id: item.id }, { $set: { completed: true }});
       }
       else if(status == 'Canceled'){
        axios.post(`${URL_BOT}/send-user`, {
          id: item.customer,
          msg:`<b>❌ Ваш заказ был отменен #${item.id}</b>
<blockquote><b>💸 Вам возвращено:</b> ${item.price}₽</blockquote>
    `}, {  headers: { 'Content-Type':'application/json' } });

         dataBase.updateOne({ id: item.customer }, { $inc: { balance: item.price }});
         orderBase.updateOne({ id: item.id }, { $set: { completed: true }});
       }
     }
   
  });
  })
});

app.post("/pay", async (req, res) => {
  const update = req.body;
  console.log(req.body);
  if (update.update_type === "invoice_paid") {
    console.log("💸 Оплата прошла!");
    const invoice = update.payload;
    const currentAmount = (update.payload.amount*1);
    orderBase.findOne({ invoice_id: invoice.invoice_id }).then((res_2) => {
      if (res_2){
        axios.post(`${URL_BOT}/send-user`, { id: res_2.id,
          msg:`<b>🎉 Ваш чек #${invoice.invoice_id}</b>
<blockquote><b>💸 Вам начисленно:</b> ${currentAmount}₽</blockquote>
    `}, {  headers: { 'Content-Type':'application/json' } });
        dataBase.updateOne({ id: res_2.id }, { $inc: { balance: currentAmount } });
      }
    })
    
    
  }
  
  res.send({ message: "Hello World" });
});




app.listen(3001, (err) => {
  err ? err : console.log("STARTED SERVER"); 
});
