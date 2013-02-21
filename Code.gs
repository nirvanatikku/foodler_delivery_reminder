/**
 * Foodler Delivery Reminder
 *
 * Creates two events in your google calendar that represent
 *    1. the order, from start time to end time (showing the duration) - without reminders
 *    2. the delivery notification, when the delivery is estimated to arrive - with sms, email and popup alerts
 *
 * An automated service that integrates Gmail and Calendar Services. 
 * Uses ScriptDb, XML service, UserProperty and triggers.
 *
 * Author: Nirvana Tikku
 * Date: 20th Feb 2013
 * 
 */
var _ = {
  
  type: 'order', 
  
  email: 'orders@foodler.com',
  subject_regex: 'Foodler order #',
  alt_subject: 'Foodler order ',
  
  reminder_period: 0, // immediately
  
  order_restaurant_xpath: 'html.body.div.table[0].tr[0].td.table.tr[1].td.b',
  order_processed_xpath: 'html.body.div.table[0].tr[1].td[1].table.tr[0].td.table.tr[1].td',
  order_tip_xpath: 'html.body.div.table[0].tr[1].td[1].table.tr[2].td.table.tr',
  order_total_xpath: 'html.body.div.table[0].tr[1].td[1].table.tr[2].td.table.tr',
  order_destination_xpath: 'html.body.div.table[1].tr[1].td.table.tr[0].td',
  order_estimated_delivery_xpath: 'html.body.div.table[1].tr[1].td.table.tr[0].td.b[1]',
  
  db: ScriptDb.getMyDb(),
  getUserID: function getUserID(){
    return Session.getEffectiveUser().getEmail();
  }
  
};

/**
 * Some basic UI to see the ScriptDb contents.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Orders');
}

/**
 * Explicitly define the triggers
 */
function Trigger_CheckGmail(){ getOrders(); }
function Trigger_CheckNewOrders(){ createReminderForLatestOrder(); }

/**
 * Method for the HTML view of all orders. 
 */
function fetchOrders(page){
  var ret = [];
  var qry = _.db.query({type: _.type, userid: _.getUserID()}).sortBy("orderID", _.db.DESCENDING, _.db.NUMERIC).paginate( page || 0, 25);
  while(qry.hasNext()){
    ret.push(qry.next());
  }
  return ret;
}

//
// http://stackoverflow.com/questions/4149276/javascript-camelcase-to-regular-form
//
function _unCamelCase(str){
    return str
        // insert a space between lower & upper
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        // space before last upper in a sequence followed by lower
        .replace(/\b([A-Z]+)([A-Z])([a-z])/, '$1 $2$3')
        // uppercase the first character
        .replace(/^./, function(str){ return str.toUpperCase(); })
}

/**
 * Parses the XML response and builds an order object.
 */
function createOrder(orderID, xmlDoc){
  var _total = eval('xmlDoc.'+_.order_total_xpath);
  var total = _total[_total.length-1].td[2].Text;
  total = total.replace('\xa0',''); // remove spaces
  var processed = eval('xmlDoc.' + _.order_processed_xpath).Text;
  if( processed.indexOf('processed') > - 1 ) { 
    processed = processed.replace('processed ', ''); 
  }
  var _tip = eval('xmlDoc.' + _.order_tip_xpath);
  var tip = _tip[_tip.length-2].td[2].Text;
  tip = tip.replace('\xa0',''); // remove spaces
  var restaurant = eval('xmlDoc.' + _.order_restaurant_xpath).Text;
  var delivery = eval('xmlDoc.' + _.order_estimated_delivery_xpath).Text;
  var destination = eval('xmlDoc.' + _.order_destination_xpath).Text;
  if(destination.indexOf('around') > -1){
    destination = destination.replace('around .','');
  }
  return { 
    userid: _.getUserID(),
    type: _.type,
    orderID: orderID,
    restaurant: restaurant,
    total: total,
    processed: processed,
    tip: tip,
    delivery: delivery,
    destination: _unCamelCase(destination),
    calEventCreated: false
  };
}

/**
 * Get the latest calendar events that calendar events have not been created for.
 */
function createReminderForLatestOrder(){
  var i = 0;
  var latestOrderQuery = _.db.query({type: _.type, calEventCreated: false, userid: _.getUserID()}).sortBy("orderID", _.db.DESCENDING, _.db.NUMERIC);
  while(latestOrderQuery.hasNext()){
    var o = latestOrderQuery.next();
    o.calEventCreated = createReminder(o);
    _.db.save(o);
    if(i++>3)break; // incase... we don't want to go off creating 10s/100s of events
  }
}

function _devTestCreation(){
  var latestOrderQuery = _.db.query({type: _.type, orderID: '237447479', userid: _.getUserID()});
  while(latestOrderQuery.hasNext()){
    var o = latestOrderQuery.next();
    o.calEventCreated = createReminder(o);
    _.db.save(o);
    break; // only 1.
  }
}

/**
 * Clears all the orders. 
 * To be triggered manually for the time being; only needed in dev mode.
 */
function clearOrders(){
  //var p1 = +new Date;
  var db = ScriptDb.getMyDb();
  //var i = 0;
  while (true) {
    var result = db.query({type: _.type, userid: _.getUserID()});
    if (result.getSize() == 0) {
      break;
    }
    while (result.hasNext()) {
      db.remove(result.next());
      //i++;
    }
  }
  //tick('clearing ' + i + ' orders', p1);
}

/**
 * Upon installation, seed the ScriptDb.
 */
function seedOrders(){
  getOrders(true);
}

/**
 * Perf function
 */
function tick(msg, p1){
  var t = +new Date;
  t -= p1;
  Logger.log(msg + " tick: " + t);
}

//
// to help with pre caching existing IDs
//
function getExistingOrderIDs(){
  //var p1 = +new Date;
  var ret = [];
  var existingIdsQuery = _.db.query({type: _.type, userid: _.getUserID()});
  while(existingIdsQuery.hasNext()){
    ret.push(existingIdsQuery.next().orderID);
  }
  //tick('got existing ids', p1);
  return ret;
}

/**
 * Seed the ScriptDb with email data. 
 * We will stop performing the save as soon as a matching order is found.
 */
function getOrders(seeding) {
  //var p1 = +new Date;
  var query = 'subject:"'+_.subject_regex+'" from:"'+_.email+'"';
  var threads = GmailApp.search(query);
  //tick('got ' + threads.length + ' query', p1);
  var msg, orderID, xmlBody, order;
  var toSave = [], 
      existingIDs = getExistingOrderIDs();
  //
  // process the messages for a given thread
  //
  var threadMessages = GmailApp.getMessagesForThreads(threads); // HUGE WIN!
  for (var i = 0; i < threads.length; i++) {
    var messages = threadMessages[i];
    //tick('processing ' + messages.length + ' messages for thread:', p1);
    for (var j = 0; j < messages.length; j++) {
      msg = messages[j];
      var subj = msg.getSubject();
      //
      // get the order ID from the subject
      //
      orderID = subj.substring(subj.indexOf('#')+1);
      if( _.alt_subject !== '' && orderID.indexOf(_.alt_subject) > -1 ) {
        orderID = orderID.replace(_.alt_subject, '');
      }
      try { 
        //
        // make sure that it doesn't exist before parsing
        //
        if(existingIDs.indexOf(orderID) === -1){
          //var p2 = +new Date;
          xmlBody = Xml.parse(msg.getBody(),true);
          order = createOrder(orderID, xmlBody);
          //tick('order create and parsed', p2);
          if( seeding ) { // if we're seeding, lets ensure we dont create a cal event. 
            // this should be refined to look at the date and determine if delivery > now.
            order.calEventCreated = [-1,-1];
          }
          toSave.push(order);
        } else { 
          if(typeof seeding === 'undefined' && toSave.length === 0){
            Logger.log("Not seeding. Skipping - assuming that remaining emails have been added.");
            return; // if we have saved items, then we're done seeding our orders db
          }
        }
      } catch (ex){
        Logger.log("Error while parsing order", ex);
      } finally { 
        //p1 = +new Date;
      }
      //
    }
    //p1 = +new Date;
  }
  //
  // save operation deferred till the end, in batch op.
  //
  if(toSave.length>0){
    _.db.saveBatch(toSave, false); // apparently false is required for > 2 
    //tick('saved batch', p1);
  }
};

// freeform text is based on these rules: http://support.google.com/calendar/bin/answer.py?hl=en&answer=36604
// TODO: improve this. parse the date/time etc.
function createReminder(order){
  var cal = CalendarApp.getDefaultCalendar();
  var freeformText = order.restaurant + ' delivery from ' + order.processed + '-' + order.delivery;
  //
  // first event
  //
  var evt = cal.createEventFromDescription(freeformText);
  evt.setDescription("OrderID: " + order.orderID + "\nTotal: " + order.total + "\nTip: " + order.tip);
  evt.setLocation(order.destination);
  //
  // reminder event for the delivery
  //
  var reminderEvt = cal.createEvent(order.restaurant + " Delivery Should Have Arrived!", evt.getEndTime(), evt.getEndTime());
  reminderEvt.addSmsReminder(_.reminder_period); // mins before
  reminderEvt.addEmailReminder(_.reminder_period);
  reminderEvt.addPopupReminder(_.reminder_period);
  return [evt.getId(), reminderEvt.getId()];
}

/**
 * Installation
 */
function onInstall(){
  //
  // do we need to seed our ScriptDb?
  //
  var seeded = UserProperties.getProperty('seeded');
  if( !seeded || seeded === '' ) { 
    UserProperties.setProperty("seeded", new Date());
    seedOrders(); 
  }
}