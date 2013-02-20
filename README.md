foodler_delivery_reminder
=========================

Google Apps Script that creates calendar notifications for deliveries from Foodler.com via emails in Gmail.

Currently parses Foodler formatted emails, but created with the idea of being able to set it up for any type of email ('xpath' values will need to be updated accordingly, and possibly the model).

High level methods:
  * doGet()
  * Trigger_CheckGmail()
  * Trigger_CheckNewOrders()
  * fetchOrders(page)
  * createOrder(orderID, xmlDoc)
  * createReminderForLatestOrder()
  * clearOrders()
  * seedOrders()
  * getExistingOrderIDs()
  * getOrders(seeding)
  * createReminder(order)
  * onInstall()

Orders.html provides a visual output (deployed as a webapp) of all foodler orders. This can be copy/pasted into excel, but a future enhancement would export the ScriptDb values to a spreadsheet.

Two triggers are added: 
  1. Check Gmail for new Foodler Emails (every 5 minutes)
  2. Check if ScriptDb has any new foodler entries, and create reminder events as appropriate (every minute)

