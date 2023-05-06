const functions = require("firebase-functions");
const admin = require("firebase-admin");
const uuid = require('uuid');

admin.initializeApp(
  {
    credential: admin.credential.applicationDefault(),
    databaseURL: "http://127.0.0.1:9000/?ns=genbay-116d4-default-rtdb",
  }
);

//! This is notifications collections reference in the firestore database.
const notifications = admin.firestore().collection('notifications');
const notificationRef = notifications.doc();

//! This function will send a notification to all the members of the event when an event is created.
exports.eventCreated = functions.firestore
  .document('/events/{eventId}')
  .onCreate(async (snapshot, context) => {
    const eventData = snapshot.data();
    const selectedMembers = eventData.selectedMembers;
    const eventName = eventData.name;

    try {
      const messagePromises = await selectedMembers.map(async (memberId) => {
        console.log('Member Id', memberId);
        const tokensRef = admin.database().ref(`/users/${memberId}/tokens`);
        const tokensSnapshot = await tokensRef.once('value');
        const tokens = tokensSnapshot.val();
        if (!tokens) {
          console.log(`Tokens not found for user ${memberId}`);
          return null;
        } else {
          tokens.forEach((token) => {
            console.log(`Token is ${token}`);
          });
          const user = await getUserWithId(eventData.userId);
          var dateString = ""
          if (eventData.isDateConfirmed == true) {
            let dateTimestamp = eventData.dateTimestamp
            const dateObj = new Date(dateTimestamp * 1000); // Convert to milliseconds
            const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: '2-digit', day: '2-digit', year: 'numeric' });
            dateString = formattedDate
            console.log("date is confirmed")
            console.log("dateString:", dateString)
          } else {
            console.log("date is not confirmed")
            dateString = "TBD"
          }
          const payload = {
            message: `${user.firstName} ${user.lastName} RSVP’d for ${eventData.name} | ${eventData.startTime} ${eventData.date}`,
            userImage: user.imageUrl,
            visibleTo: memberId,
            userId: eventData.userId,
            timeStamp: Date.now(),
          }
          const message = {
            notification: {
              title: String(eventName),
              body: `Event ${eventName} has been created`
            },
            data: {
              type: 'eventCreated',
              info: JSON.stringify(payload)
            },
            tokens: tokens
          };
          //!This is the notification object which will be stored in the firestore notifications collection.
          const newNotification = {
            type: message.data.type,
            info: JSON.parse(message.data.info),
            tokens: tokens,
            id: notificationRef.id,
            status: 'unread',
          }
          await notificationRef.set(newNotification);
          message.data.info = JSON.stringify(message.data.info);
          return admin.messaging().sendEachForMulticast(message);
        }
      });

      let messages = await Promise.all(messagePromises);
      messages.forEach((message) => {
        const successfulResponses = message.responses.filter((response) => response.success);
        successfulResponses.forEach((response) => {
          console.log('Response', JSON.stringify(response));
        });
      });

    } catch (error) {
      console.log('Error sending message:', error);
    }

    return null;
  });

/**
 ** MARK: -  This function will send a notification to all the members of the event when an event is updated
*/
exports.eventUpdated = functions.firestore
  .document("/events/{eventId}")
  .onUpdate(async (snapshot, context) => {
    const eventData = snapshot.after.data();
    const selectedMembers = eventData.selectedMembers;
    const eventName = eventData.name;
    console.log("Event Data", JSON.stringify(eventData));
    try {
      const messagePromises = await selectedMembers.map(async (memberId) => {
        console.log('Member Id', memberId);
        const tokensRef = admin.database().ref(`/users/${memberId}/tokens`);
        const tokensSnapshot = await tokensRef.once('value');
        const tokens = tokensSnapshot.val();
        if (!tokens) {
          console.log(`Tokens not found for user ${memberId}`);
          return null;
        } else {
          tokens.forEach((token) => {
            console.log(`Token is ${token}`);
          });
          const user = await getUserWithId(eventData.userId);
          var dateString = ""
          if (eventData.isDateConfirmed == true) {
            let dateTimestamp = eventData.dateTimestamp
            const dateObj = new Date(dateTimestamp * 1000); // Convert to milliseconds
            const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: '2-digit', day: '2-digit', year: 'numeric' });
            dateString = formattedDate
            console.log("date is confirmed")
            console.log("dateString:", dateString)
          } else {
            console.log("date is not confirmed")
            dateString = "TBD"
          }
          const payload = {
            message: `${user.firstName} ${user.lastName} RSVP’d for ${eventData.name} | ${eventData.startTime} ${dateString}`,
            userImage: user.imageUrl,
            visibleTo: memberId,
            userId: eventData.userId,
            timeStamp: Date.now(),
          }
          const message = {
            notification: {
              title: String(eventName),
              body: `Event ${eventName} has been updated`
            },
            data: {
              type: 'eventUpdated',
              info: JSON.stringify(payload)
            },
            tokens: tokens
          };

          //!This is the notification object which will be stored in the firestore notifications collection.
          const newNotification = {
            type: message.data.type,
            info: JSON.parse(message.data.info),
            tokens: tokens,
            id: notificationRef.id,
            status: 'unread',
          }
          await notificationRef.set(newNotification);
          message.data.info = JSON.stringify(message.data.info);
          return admin.messaging().sendEachForMulticast(message);
        }
      });

      let messages = await Promise.all(messagePromises);
      messages.forEach((message) => {
        const successfulResponses = message.responses.filter((response) => response.success);
        successfulResponses.forEach((response) => {
          console.log('Response', JSON.stringify(response));
        });
      });

    } catch (error) {
      console.log('Error sending message:', error);
    }

    return null;

  });

//!This function will be called when a user sends a friend request to another user.
exports.friendRequestSent = functions.database
  .ref("/friends/{userId}/pendingList/{index}")
  .onCreate(async (snapshot, context) => {
    const friendIndex = context.params.index;
    const userId = context.params.userId;
    console.log("Friend index", friendIndex);
    console.log("User Id", userId);
    try {
      const pendingListRef = admin.database().ref(`/friends/${userId}/pendingList`);
      const pendingListSnapshot = await pendingListRef.once('value');
      const pendingList = pendingListSnapshot.val();
      if (!pendingList) {
        console.log(`Pending friend requests not found for user ${userId}`);
        return null;
      } else {
        const friendId = pendingList[friendIndex];
        console.log("Friend Id", friendId);
        const tokensRef = admin.database().ref(`/users/${friendId}/tokens`);
        const tokensSnapshot = await tokensRef.once('value');
        const tokens = tokensSnapshot.val();
        if (!tokens) {
          console.log(`Tokens not found for user ${friendId}`);
          return null;
        } else {
          tokens.forEach((token) => {
            console.log(`Token is ${token}`);
          });
          const friend = await getUserWithId(friendId);

          //!this is the payload which will be sent as an info in the notification data.
          const payload = {
            message: `You have a new friend request from ${friend.firstName} ${friend.lastName}`,
            userImage: friend.imageUrl,
            visibleTo: userId,
            userId: friendId,
            timeStamp: Date.now(),
          }
          const message = {
            notification: {
              title: "Friend Request",
              body: `You have a new friend request`
            },
            data: {
              type: 'friendRequestSent',
              info: JSON.stringify(payload)
            },
            tokens: tokens
          };
          //!This is the notification object which will be stored in the firestore notifications collection.
          const newNotification = {
            type: message.data.type,
            info: JSON.parse(message.data.info),
            tokens: tokens,
            id: notificationRef.id,
            status: 'unread',
          }
          await notificationRef.set(newNotification);
          message.data.info = JSON.stringify(message.data.info);
          return admin.messaging().sendEachForMulticast(message);
        }
      }
    } catch (error) {
      console.log('Error sending message:', error);
    }

    return null;
  });

//!This function will be called when a user accepts a friend request.
exports.friendRequestAccepted = functions.database
  .ref("/friends/{userId}/acceptedList/{index}")
  .onCreate(async (snapshot, context) => {
    const friendIndex = context.params.index;
    const userId = context.params.userId;
    console.log("Friend index", friendIndex);
    console.log("User Id", userId);
    try {
      const acceptedListRef = admin.database().ref(`/friends/${userId}/acceptedList`);
      const acceptedListSnapshot = await acceptedListRef.once('value');
      const acceptedList = acceptedListSnapshot.val();
      if (!acceptedList) {
        console.log(`accepted friend requests not found for user ${userId}`);
        return null;
      } else {
        const friendId = acceptedList[friendIndex];
        console.log("Friend Id", friendId);
        const tokensRef = admin.database().ref(`/users/${friendId}/tokens`);
        const tokensSnapshot = await tokensRef.once('value');
        const tokens = tokensSnapshot.val();
        if (!tokens) {
          console.log(`Tokens not found for user ${friendId}`);
          return null;
        } else {
          tokens.forEach((token) => {
            console.log(`Token is ${token}`);
          });
          const user = await getUserWithId(userId);
          const payload = {
            message: `${user.firstName} ${user.lastName} has accepted your friend request!`,
            userImage: user.imageUrl,
            visibleTo: friendId,
            userId: userId,
            timeStamp: Date.now()
          }
          const message = {
            notification: {
              title: "Friend Request Accepted",
              body: `Friend request has been accepted`
            },
            data: {
              type: 'friendRequestAccepted',
              info: JSON.stringify(payload)
            },
            tokens: tokens
          };
          //!This is the notification object which will be stored in the firestore notifications collection.
          const newNotification = {
            type: message.data.type,
            info: JSON.parse(message.data.info),
            tokens: tokens,
            id: notificationRef.id,
            status: 'unread',
          }
          await notificationRef.set(newNotification);
          message.data.info = JSON.stringify(message.data.info);
          return admin.messaging().sendEachForMulticast(message);
        }
      }
    } catch (error) {
      console.log('Error sending message:', error);
    }

    return null;
  });


async function getUserWithId(userId) {
  const userRef = admin.database().ref(`/users/${userId}`);
  const userSnapshot = await userRef.once('value');
  const user = userSnapshot.val();
  if (!user) {
    console.log(`User not found for id ${userId}`);
    return null;
  } else {
    console.log("User", user);
    return user;
  }
}


// id: eventData.id,
// name: eventData.name,
// date: eventData.date,
// startTime: eventData.startTime,
// createdAt: Date.now(),
// hostId: eventData.userId,
// visibleTo: memberId,
// hostName: `${user.firstName} ${user.lastName}`,
// hostImageUrl: user.imageUrl,