'use strict';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL;

//new text

// Imports dependencies and set up http server
const 
  { uuid } = require('uuidv4'),
  {format} = require('util'),
  request = require('request'),
  express = require('express'),
  body_parser = require('body-parser'),
  firebase = require("firebase-admin"),
  ejs = require("ejs"),  
  fs = require('fs'),
  multer  = require('multer'),  
  app = express(); 

const uuidv4 = uuid();


app.use(body_parser.json());
app.use(body_parser.urlencoded());

const bot_questions = {
  "q1": "Where would you like to send this? (Don't forget to include the apartment#)",
  "q2": "What is the recepient's full name in case we need to contact them about delivery?",
  "q3": "Please enter date (yy:mm:dd)",
  "q4": "What is the recipent's phone number in case we need to contant them about delivery?",
  "q5": "Comfirm a email that you would like you order confirmation to be sent",
}

let current_question = '';

let user_id = ''; 

let userInputs = [];


/*
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
})*/

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits :{
    fileSize: 50 * 1024 * 1024  //no larger than 5mb
  }

});

// parse application/x-www-form-urlencoded


app.set('view engine', 'ejs');
app.set('views', __dirname+'/views');


var firebaseConfig = {
     credential: firebase.credential.cert({
    "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    "client_email": process.env.FIREBASE_CLIENT_EMAIL,
    "project_id": process.env.FIREBASE_PROJECT_ID,    
    }),
    databaseURL: process.env.FIREBASE_DB_URL,   
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  };



firebase.initializeApp(firebaseConfig);

let db = firebase.firestore(); 
let bucket = firebase.storage().bucket();

// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => console.log('webhook is listening'));

// Accepts POST requests at /webhook endpoint
app.post('/webhook', (req, res) => {  

  // Parse the request body from the POST
  let body = req.body;

  

  // Check the webhook event is from a Page subscription
  if (body.object === 'page') {
    body.entry.forEach(function(entry) {

      let webhook_event = entry.messaging[0];
      let sender_psid = webhook_event.sender.id; 

      user_id = sender_psid; 

      if(!userInputs[user_id]){
        userInputs[user_id] = {};
      }    


      if (webhook_event.message) {
        if(webhook_event.message.quick_reply){
            handleQuickReply(sender_psid, webhook_event.message.quick_reply.payload);
          }else{
            handleMessage(sender_psid, webhook_event.message);                       
          }                
      } else if (webhook_event.postback) {        
        handlePostback(sender_psid, webhook_event.postback);
      }
      
    });
    // Return a '200 OK' response to all events
    res.status(200).send('EVENT_RECEIVED');

  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }

});


app.use('/uploads', express.static('uploads'));


app.get('/',function(req,res){    
    res.send('your app is up and running');
});

app.get('/test',function(req,res){    
    res.render('test.ejs');
});

app.post('/test',function(req,res){
    const sender_psid = req.body.sender_id;     
    let response = {"text": "You  click delete button"};
    callSend(sender_psid, response);
});

app.get('/admin/appointments', async function(req,res){
 
  const appointmentsRef = db.collection('appointments');
  const snapshot = await appointmentsRef.get();

  if (snapshot.empty) {
    res.send('no data');
  } 

  let data = []; 

  snapshot.forEach(doc => {
    let appointment = {};
    appointment = doc.data();
    appointment.doc_id = doc.id;

    data.push(appointment);
    
  });

  console.log('DATA:', data);

  res.render('appointments.ejs', {data:data});
  
});

app.get('/admin/updateappointment/:doc_id', async function(req,res){
  let doc_id = req.params.doc_id; 
  
  const appoinmentRef = db.collection('appointments').doc(doc_id);
  const doc = await appoinmentRef.get();
  if (!doc.exists) {
    console.log('No such document!');
  } else {
    console.log('Document data:', doc.data());
    let data = doc.data();
    data.doc_id = doc.id;

    console.log('Document data:', data);
    res.render('editappointment.ejs', {data:data});
  } 

});


app.post('/admin/updateappointment', function(req,res){
  console.log('REQ:', req.body); 

  

  let data = {
    name:req.body.name,
    phone:req.body.phone,
    email:req.body.email,
    flower:req.body.flower,
    start:req.body.start,
    selection:req.body.selection,
    location:req.body.location,
    date:req.body.date,
    message:req.body.message,
    status:req.body.status,
    doc_id:req.body.doc_id,
    ref:req.body.ref,
    comment:req.body.comment
  }

  db.collection('appointments').doc(req.body.doc_id)
  .update(data).then(()=>{
      res.redirect('/admin/appointments');
  }).catch((err)=>console.log('ERROR:', error)); 
 
});

/*********************************************
Gallery page
**********************************************/
app.get('/showimages/:sender_id/',function(req,res){
    const sender_id = req.params.sender_id;

    let data = [];

    db.collection("images").limit(20).get()
    .then(  function(querySnapshot) {
        querySnapshot.forEach(function(doc) {
            let img = {};
            img.id = doc.id;
            img.url = doc.data().url;         

            data.push(img);                      

        });
        console.log("DATA", data);
        res.render('gallery.ejs',{data:data, sender_id:sender_id, 'page-title':'welcome to my page'}); 

    }
    
    )
    .catch(function(error) {
        console.log("Error getting documents: ", error);
    });    
});


app.post('/imagepick',function(req,res){
      
  const sender_id = req.body.sender_id;
  const doc_id = req.body.doc_id;

  console.log('DOC ID:', doc_id); 

  db.collection('images').doc(doc_id).get()
  .then(doc => {
    if (!doc.exists) {
      console.log('No such document!');
    } else {
      const image_url = doc.data().url;

      console.log('IMG URL:', image_url);

      let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Is this the image you like?",
            "image_url":image_url,                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Yes!",
                  "payload": "yes",
                },
                {
                  "type": "postback",
                  "title": "No!",
                  "payload": "no",
                }
              ],
          }]
        }
      }
    }

  
    callSend(sender_id, response); 
    }
  })
  .catch(err => {
    console.log('Error getting document', err);
  });
      
});



/*********************************************
END Gallery Page
**********************************************/

//webview test
app.get('/webview/:sender_id',function(req,res){
    const sender_id = req.params.sender_id;
    res.render('webview.ejs',{title:"Hello!! from WebView", sender_id:sender_id});
});

app.post('/webview',upload.single('file'),function(req,res){
       
      let name  = req.body.name;
      let email = req.body.email;
      let img_url = "";
      let sender = req.body.sender;  

      console.log("REQ FILE:",req.file);



      let file = req.file;
      if (file) {
        uploadImageToStorage(file).then((img_url) => {
            db.collection('webview').add({
              name: name,
              email: email,
              image: img_url
              }).then(success => {   
                console.log("DATA SAVED")
                thankyouReply(sender, name, img_url);    
              }).catch(error => {
                console.log(error);
              }); 
        }).catch((error) => {
          console.error(error);
        });
      }



     
      
      
           
});

//Set up Get Started Button. To run one time
//eg https://fbstarter.herokuapp.com/setgsbutton
app.get('/setgsbutton',function(req,res){
    setupGetStartedButton(res);    
});

//Set up Persistent Menu. To run one time
//eg https://fbstarter.herokuapp.com/setpersistentmenu
app.get('/setpersistentmenu',function(req,res){
    setupPersistentMenu(res);    
});

//Remove Get Started and Persistent Menu. To run one time
//eg https://fbstarter.herokuapp.com/clear
app.get('/clear',function(req,res){    
    removePersistentMenu(res);
});

//whitelist domains
//eg https://fbstarter.herokuapp.com/whitelists
app.get('/whitelists',function(req,res){    
    whitelistDomains(res);
});


// Accepts GET requests at the /webhook endpoint
app.get('/webhook', (req, res) => {
  

  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;  

  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];  
    
  // Check token and mode
  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      res.status(200).send(challenge);    
    } else {      
      res.sendStatus(403);      
    }
  }
});

/**********************************************
Function to Handle when user send quick reply message
***********************************************/

function handleQuickReply(sender_psid, received_message) {

  console.log('QUICK REPLY', received_message);

  received_message = received_message.toLowerCase();

  if(received_message.startsWith("selection:")){
    let selection = received_message.slice(10);
    
    userInputs[user_id].selection = selection;
    
    current_question = 'q1';
    botQuestions(current_question, sender_psid);
  }else if(received_message.startsWith("start:")){
    let dept = received_message.slice(6);
    userInputs[user_id].start = dept;
    showCollection(sender_psid);
  }else{

      switch(received_message) {                
        case "on":
            showQuickReplyOn(sender_psid);
          break;
        case "off":
            showQuickReplyOff(sender_psid);
          break; 
        case "confirm-appointment":
              saveAppointment(userInputs[user_id], sender_psid);
          break;              
        default:
            defaultReply(sender_psid);
    } 

  }
  
  
 
}

/**********************************************
Function to Handle when user send text message
***********************************************/

const handleMessage = (sender_psid, received_message) => {

  console.log('TEXT REPLY', received_message);
  //let message;
  let response;

  if(received_message.attachments){
     handleAttachments(sender_psid, received_message.attachments);
  }else if(current_question == 'q1'){
     console.log('LOCATION ENTERED',received_message.text);
     userInputs[user_id].location = received_message.text;
     current_question = 'q2';
     botQuestions(current_question, sender_psid);
  }else if(current_question == 'q2'){
     console.log('FULL NAME ENTERED',received_message.text);
     userInputs[user_id].name = received_message.text;
     current_question = 'q3';
     botQuestions(current_question, sender_psid);
  }else if(current_question == 'q3'){
     console.log('DATE ENTERED',received_message.text);
     userInputs[user_id].date = received_message.text;
     current_question = 'q4';
     botQuestions(current_question, sender_psid);
  }else if(current_question == 'q4'){
     console.log('PHONE NUMBER ENTERED',received_message.text);
     userInputs[user_id].phone = received_message.text;
     current_question = 'q5';
     botQuestions(current_question, sender_psid);
  }else if(current_question == 'q5'){
     console.log('EMAIL ENTERED',received_message.text);
     userInputs[user_id].email = received_message.text;
     current_question = '';
     
     confirmAppointment(sender_psid);

  }
  else {
      
      let user_message = received_message.text;      
     
      user_message = user_message.toLowerCase(); 

      switch(user_message) { 
      case "hi":
          hiReply(sender_psid);
        break;
      case "order":
          flowerOrder(sender_psid);
        break;                
      case "text":
        textReply(sender_psid);
        break;
      case "quick":
        quickReply(sender_psid);
        break;
      case "button":                  
        buttonReply(sender_psid);
        break;
      case "webview":
        webviewTest(sender_psid);
        break;       
      case "show images":
        showImages(sender_psid)
        break;               
      default:
          defaultReply(sender_psid);
      }       
          
      
    }

}

/*********************************************
Function to handle when user send attachment
**********************************************/


const handleAttachments = (sender_psid, attachments) => {
  
  console.log('ATTACHMENT', attachments);


  let response; 
  let attachment_url = attachments[0].payload.url;
    response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Is this the right picture?",
            "subtitle": "Tap a button to answer.",
            "image_url": attachment_url,
            "buttons": [
              {
                "type": "postback",
                "title": "Yes!",
                "payload": "yes-attachment",
              },
              {
                "type": "postback",
                "title": "No!",
                "payload": "no-attachment",
              }
            ],
          }]
        }
      }
    }
    callSend(sender_psid, response);
}


/*********************************************
Function to handle when user click button
**********************************************/
const handlePostback = (sender_psid, received_postback) => { 

  

  let payload = received_postback.payload;

  console.log('BUTTON PAYLOAD', payload);

  
  if(payload.startsWith("Flower:")){
    let flower_selection = payload.slice(7);
    console.log('SELECTED FLOWER IS: ', flower_selection);
    userInputs[user_id].flower = flower_selection;
    console.log('TEST', userInputs);
    showWildFlower(sender_psid);
  }else{

      switch(payload) {        
      case "WildFlower":
          showWildFlower(sender_psid);
        break;
      case "Seasonal":
          showSeasonal(sender_psid);
        break; 
      case "Love & Romance":
          showLove(sender_psid);
        break;  
      case "Birthday":
          showBirthday(sender_psid);
        break;                       
      default:
          defaultReply(sender_psid);
    } 

  }


  
}


const generateRandom = (length) => {
   var result           = '';
   var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
   var charactersLength = characters.length;
   for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}

/*********************************************
GALLERY SAMPLE
**********************************************/

const showImages = (sender_psid) => {
  let response;
  response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "show images",                       
            "buttons": [              
              {
                "type": "web_url",
                "title": "enter",
                "url":"https://fbstarter.herokuapp.com/showimages/"+sender_psid,
                 "webview_height_ratio": "full",
                "messenger_extensions": true,          
              },
              
            ],
          }]
        }
      }
    }
  callSendAPI(sender_psid, response);
}


/*********************************************
END GALLERY SAMPLE
**********************************************/


function webviewTest(sender_psid){
  let response;
  response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Click to open webview?",                       
            "buttons": [              
              {
                "type": "web_url",
                "title": "webview",
                "url":APP_URL+"webview/"+sender_psid,
                 "webview_height_ratio": "full",
                "messenger_extensions": true,          
              },
              
            ],
          }]
        }
      }
    }
  callSendAPI(sender_psid, response);
}

/**************
start hospital
**************/
const flowerOrder = (sender_psid) => {
   let response1 = {"text": "Welcome to Lily Flower Gift Service"};
   let response2 = {
    "text": "What would you like to do today?",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"Send a gift",
              "payload":"start:Send a gift",              
            },{
              "content_type":"text",
              "title":"Track my order",
              "payload":"start:Track my order",             
            },

    ]
  };

  callSend(sender_psid, response1).then(()=>{
    return callSend(sender_psid, response2);
  });
}


const showCollection = (sender_psid) => {
    let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Wild Beauty",
            "image_url":"https://i.dlpng.com/static/png/1584646-premium-flowers-assortment-assorted-flowers-png-4272_2848_preview.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "View Collection",
                  "payload": "WildFlower",
                },               
              ],
          },{
            "title": "Seasonal",
            "subtitle": "Special",
            "image_url":"https://www.bloominggreenflowers.co.uk/wp-content/uploads/2017/01/Bouquet-seasonal-flowers.jpeg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "View Collection",
                  "payload": "Flower:View Collection",
                },               
              ],
          },{
            "title": "Love & Romancce",
            "subtitle": "I Love You",
            "image_url":"https://www.artemisia.fi.it/fioristi/wp-content/uploads/2016/02/Bouquet_love-scaled.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "View Collection",
                  "payload": "Flower:View Collection",
                },               
              ],
          },{
            "title": "Happy Birthday",
            "subtitle": "Make Happier",
            "image_url":"https://pembertonsflowers.com/wp-content/uploads/2018/11/T602-2B.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "View Collection",
                  "payload": "Flower:View Collection",
                },               
              ],
          }

          ]
        }
      }
    }

  
  callSend(sender_psid, response);

}

const showWildFlower = (sender_psid) => {
  let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Gabriella",
            "subtitle": "20,000MMK",
            "image_url":"https://i.pinimg.com/originals/a4/f1/1c/a4f11ca25c295d6a140cafe4694c5c9a.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "wild:Select",
                },               
              ],
          },{
            "title": "Chole",
            "subtitle": "25,000MMK",
            "image_url":"https://assets.vogue.com/photos/5a4bd32ca43649100715861c/master/w_2560%2Cc_limit/00-story-floral.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "wild:Select",
                },               
              ],
          },{
            "title": "Naomi",
            "subtitle": "25,000MMK",
            "image_url":"https://image.freepik.com/free-photo/beautiful-bouquet-wild-flowers-voloshki-chamomiles-dark-surface_130716-785.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "wild:Select",
                },               
              ],
          },{
            "title": "Madison",
            "subtitle": "30,000MMK",
            "image_url":"https://anniebrook.com.au/wp-content/uploads/2017/11/WB-NWB-2.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "wild:Select",
                },               
              ],
          }

          ]
        }
      }
    }

 
  callSend(sender_psid, response);

}

const showSeasonal = (sender_psid) => {
  let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Acashia",
            "subtitle": "20,000MMK",
            "image_url":"https://i.pinimg.com/originals/a4/f1/1c/a4f11ca25c295d6a140cafe4694c5c9a.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "seasonal:Select",
                },               
              ],
          },{
            "title": "Chole",
            "subtitle": "25,000MMK",
            "image_url":"https://assets.vogue.com/photos/5a4bd32ca43649100715861c/master/w_2560%2Cc_limit/00-story-floral.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "seasonal:Select",
                },               
              ],
          },{
            "title": "Naomi",
            "subtitle": "25,000MMK",
            "image_url":"https://image.freepik.com/free-photo/beautiful-bouquet-wild-flowers-voloshki-chamomiles-dark-surface_130716-785.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "seasonal:Select",
                },               
              ],
          },{
            "title": "Madison",
            "subtitle": "30,000MMK",
            "image_url":"https://anniebrook.com.au/wp-content/uploads/2017/11/WB-NWB-2.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "seasonal:Select",
                },               
              ],
          }

          ]
        }
      }
    }

 
  callSend(sender_psid, response);

}

const showLove = (sender_psid) => {
  let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Chocolate",
            "subtitle": "20,000MMK",
            "image_url":"https://i.pinimg.com/originals/a4/f1/1c/a4f11ca25c295d6a140cafe4694c5c9a.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "love:Select",
                },               
              ],
          },{
            "title": "Chole",
            "subtitle": "25,000MMK",
            "image_url":"https://assets.vogue.com/photos/5a4bd32ca43649100715861c/master/w_2560%2Cc_limit/00-story-floral.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "love:Select",
                },               
              ],
          },{
            "title": "Naomi",
            "subtitle": "25,000MMK",
            "image_url":"https://image.freepik.com/free-photo/beautiful-bouquet-wild-flowers-voloshki-chamomiles-dark-surface_130716-785.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "love:Select",
                },               
              ],
          },{
            "title": "Madison",
            "subtitle": "30,000MMK",
            "image_url":"https://anniebrook.com.au/wp-content/uploads/2017/11/WB-NWB-2.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "love:Select",
                },               
              ],
          }

          ]
        }
      }
    }

 
  callSend(sender_psid, response);

}

const showBirthday = (sender_psid) => {
  let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Rose",
            "subtitle": "20,000MMK",
            "image_url":"https://i.pinimg.com/originals/a4/f1/1c/a4f11ca25c295d6a140cafe4694c5c9a.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "birthday:Select",
                },               
              ],
          },{
            "title": "Chole",
            "subtitle": "25,000MMK",
            "image_url":"https://assets.vogue.com/photos/5a4bd32ca43649100715861c/master/w_2560%2Cc_limit/00-story-floral.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "birthday:Select",
                },               
              ],
          },{
            "title": "Naomi",
            "subtitle": "25,000MMK",
            "image_url":"https://image.freepik.com/free-photo/beautiful-bouquet-wild-flowers-voloshki-chamomiles-dark-surface_130716-785.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "birthday:Select",
                },               
              ],
          },{
            "title": "Madison",
            "subtitle": "30,000MMK",
            "image_url":"https://anniebrook.com.au/wp-content/uploads/2017/11/WB-NWB-2.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Select",
                  "payload": "birthday:Select",
                },               
              ],
          }

          ]
        }
      }
    }

 
  callSend(sender_psid, response);

}



const botQuestions = (current_question, sender_psid) => {
  if(current_question == 'q1'){
    let response = {"text": bot_questions.q1};
    callSend(sender_psid, response);
  }else if(current_question == 'q2'){
    let response = {"text": bot_questions.q2};
    callSend(sender_psid, response);
  }else if(current_question == 'q3'){
    let response = {"text": bot_questions.q3};
    callSend(sender_psid, response);
  }else if(current_question == 'q4'){
    let response = {"text": bot_questions.q4};
    callSend(sender_psid, response);
  }else if(current_question == 'q5'){
    let response = {"text": bot_questions.q5};
    callSend(sender_psid, response);
  }else if(current_question == 'q6'){
    let response = {"text": bot_questions.q6};
    callSend(sender_psid, response);
  }else if(current_question == 'q7'){
    let response = {"text": bot_questions.q7};
    callSend(sender_psid, response);
  }
}

const confirmAppointment = (sender_psid) => {
  console.log('APPOINTMENT INFO', userInputs);
  let summery = "start:" + userInputs[user_id].start + "\u000A";
  summery += "flower:" + userInputs[user_id].flower + "\u000A";
  summery += "selection:" + userInputs[user_id].selection + "\u000A";
  summery += "select:" + userInputs[user_id].select + "\u000A";
  summery += "location:" + userInputs[user_id].location + "\u000A";
  summery += "date:" + userInputs[user_id].date + "\u000A";
  summery += "name:" + userInputs[user_id].name + "\u000A";
  summery += "phone:" + userInputs[user_id].phone + "\u000A";
  summery += "email:" + userInputs[user_id].email + "\u000A";

  let response1 = {"text": summery};

  let response2 = {
    "text": "Select your reply",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"Confirm",
              "payload":"confirm-appointment",              
            },{
              "content_type":"text",
              "title":"Cancel",
              "payload":"off",             
            }
    ]
  };
  
  callSend(sender_psid, response1).then(()=>{
    return callSend(sender_psid, response2);
  });
}

const saveAppointment = (arg, sender_psid) => {
  let data = arg;
  data.ref = generateRandom(6);
  data.status = "pending";
  db.collection('appointments').add(data).then((success)=>{
    console.log('SAVED', success);
    let text = "Thank you. We have received your appointment."+ "\u000A";
    text += " We wil call you to confirm soon"+ "\u000A";
    text += "Your booking reference number is:" + data.ref;
    let response = {"text": text};
    callSend(sender_psid, response);
  }).catch((err)=>{
     console.log('Error', err);
  });
}

/**************
end hospital
**************/




const hiReply =(sender_psid) => {
  let response = {"text": "Welcome to Flower Gift Service"};
  callSend(sender_psid, response);
}


const greetInMyanmar =(sender_psid) => {
  let response = {"text": "Mingalarbar. How may I help"};
  callSend(sender_psid, response);
}

const textReply =(sender_psid) => {
  let response = {"text": "You sent text message"};
  callSend(sender_psid, response);
}


const quickReply =(sender_psid) => {
  let response = {
    "text": "Select your reply",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"On",
              "payload":"on",              
            },{
              "content_type":"text",
              "title":"Off",
              "payload":"off",             
            }
    ]
  };
  callSend(sender_psid, response);
}

const showQuickReplyOn =(sender_psid) => {
  let response = { "text": "You sent quick reply ON" };
  callSend(sender_psid, response);
}

const showQuickReplyOff =(sender_psid) => {
  let response = { "text": "You sent quick reply OFF" };
  callSend(sender_psid, response);
}

const buttonReply =(sender_psid) => {

  let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Are you OK?",
            "image_url":"https://www.mindrops.com/images/nodejs-image.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Yes!",
                  "payload": "yes",
                },
                {
                  "type": "postback",
                  "title": "No!",
                  "payload": "no",
                }
              ],
          }]
        }
      }
    }

  
  callSend(sender_psid, response);
}

const showButtonReplyYes =(sender_psid) => {
  let response = { "text": "You clicked YES" };
  callSend(sender_psid, response);
}

const showButtonReplyNo =(sender_psid) => {
  let response = { "text": "You clicked NO" };
  callSend(sender_psid, response);
}

const thankyouReply =(sender_psid, name, img_url) => {
  let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Thank you! " + name,
            "image_url":img_url,                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Yes!",
                  "payload": "yes",
                },
                {
                  "type": "postback",
                  "title": "No!",
                  "payload": "no",
                }
              ],
          }]
        }
      }
    }
  callSend(sender_psid, response);
}

function testDelete(sender_psid){
  let response;
  response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Delete Button Test",                       
            "buttons": [              
              {
                "type": "web_url",
                "title": "enter",
                "url":"https://fbstarter.herokuapp.com/test/",
                 "webview_height_ratio": "full",
                "messenger_extensions": true,          
              },
              
            ],
          }]
        }
      }
    }
  callSendAPI(sender_psid, response);
}

const defaultReply = (sender_psid) => {
  let response1 = {"text": "Welcome Lily Flower Service"};
  let response2 = {"text": "To test quick reply, type 'quick'"}; 
  let response3 = {"text": "To test button reply, type 'button'"};   
  let response4 = {"text": "To test webview, type 'webview'"};
    callSend(sender_psid, response1).then(()=>{
      return callSend(sender_psid, response2).then(()=>{
        return callSend(sender_psid, response3).then(()=>{
          return callSend(sender_psid, response4);
        });
      });
  });  
}

const callSendAPI = (sender_psid, response) => {   
  let request_body = {
    "recipient": {
      "id": sender_psid
    },
    "message": response
  }
  
  return new Promise(resolve => {
    request({
      "uri": "https://graph.facebook.com/v6.0/me/messages",
      "qs": { "access_token": PAGE_ACCESS_TOKEN },
      "method": "POST",
      "json": request_body
    }, (err, res, body) => {
      if (!err) {
        //console.log('RES', res);
        console.log('BODY', body);
        resolve('message sent!')
      } else {
        console.error("Unable to send message:" + err);
      }
    }); 
  });
}

async function callSend(sender_psid, response){
  let send = await callSendAPI(sender_psid, response);
  return 1;
}


const uploadImageToStorage = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject('No image file');
    }
    let newFileName = `${Date.now()}_${file.originalname}`;

    let fileUpload = bucket.file(newFileName);

    const blobStream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
         metadata: {
            firebaseStorageDownloadTokens: uuidv4
          }
      }
    });

    blobStream.on('error', (error) => {
      console.log('BLOB:', error);
      reject('Something is wrong! Unable to upload at the moment.');
    });

    blobStream.on('finish', () => {
      // The public URL can be used to directly access the file via HTTP.
      //const url = format(`https://storage.googleapis.com/${bucket.name}/${fileUpload.name}`);
      const url = format(`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${fileUpload.name}?alt=media&token=${uuidv4}`);
      console.log("image url:", url);
      resolve(url);
    });

    blobStream.end(file.buffer);
  });
}




/*************************************
FUNCTION TO SET UP GET STARTED BUTTON
**************************************/

const setupGetStartedButton = (res) => {
  let messageData = {"get_started":{"payload":"get_started"}};

  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      form: messageData
    },
    function (error, response, body) {
      if (!error && response.statusCode == 200) {        
        res.send(body);
      } else { 
        // TODO: Handle errors
        res.send(body);
      }
  });
} 

/**********************************
FUNCTION TO SET UP PERSISTENT MENU
***********************************/



const setupPersistentMenu = (res) => {
  var messageData = { 
      "persistent_menu":[
          {
            "locale":"default",
            "composer_input_disabled":false,
            "call_to_actions":[
                {
                  "type":"postback",
                  "title":"View My Tasks",
                  "payload":"view-tasks"
                },
                {
                  "type":"postback",
                  "title":"Add New Task",
                  "payload":"add-task"
                },
                {
                  "type":"postback",
                  "title":"Cancel",
                  "payload":"cancel"
                }
          ]
      },
      {
        "locale":"default",
        "composer_input_disabled":false
      }
    ]          
  };
        
  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      form: messageData
  },
  function (error, response, body) {
      if (!error && response.statusCode == 200) {
          res.send(body);
      } else { 
          res.send(body);
      }
  });
} 

/***********************
FUNCTION TO REMOVE MENU
************************/

const removePersistentMenu = (res) => {
  var messageData = {
          "fields": [
             "persistent_menu" ,
             "get_started"                 
          ]               
  };  
  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'DELETE',
      headers: {'Content-Type': 'application/json'},
      form: messageData
  },
  function (error, response, body) {
      if (!error && response.statusCode == 200) {          
          res.send(body);
      } else {           
          res.send(body);
      }
  });
} 


/***********************************
FUNCTION TO ADD WHITELIST DOMAIN
************************************/

const whitelistDomains = (res) => {
  var messageData = {
          "whitelisted_domains": [
             APP_URL , 
             "https://flowergift.herokuapp.com/" ,                                   
          ]               
  };  
  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      form: messageData
  },
  function (error, response, body) {
      if (!error && response.statusCode == 200) {          
          res.send(body);
      } else {           
          res.send(body);
      }
  });
} 