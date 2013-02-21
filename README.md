Foodler Delivery Reminder Script
================================

Google Apps Script provides an automated service that creates calendar notifications for deliveries from Foodler.com using Gmail and Google Calendar.

This script currently parses emails from orders@foodler.com. It is assumed to be formatted in a particular way (as per Foodler's formating), but created with an eye towards being able to set it up for any type of delivery service (pseudo-xpath values will need to be updated accordingly, and possibly the model).

Here are the methods at a high level:
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

Orders.html provides a visual output (deployed as a webapp) of all foodler orders for the given user. This can be copy/pasted into excel, but a future enhancement is to export the ScriptDb values to a spreadsheet.

Two triggers are added as part of this script: 
  1. Check Gmail for new Foodler Emails (every 5 minutes)
  2. Check if ScriptDb has any new foodler entries, and create reminder events as appropriate (every minute)

When the user installs this script, it will seed the ScriptDb with all the foodler emails in that user's account. 

The triggers will check gmail for new emails from foodler, and create notifications for the delivery if necesary.