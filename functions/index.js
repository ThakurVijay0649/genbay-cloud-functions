const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp(
  {
    credential: admin.credential.applicationDefault(),
    databaseURL: "http://127.0.0.1:9500/?ns=genbay-116d4-default-rtdb",
  }
);

//! This is notifications collections reference in the firestore database.
const notifications = admin.firestore().collection('notifications');

//! This function will send a notification to all the members of the event when an event is created.
exports.eventCreated = functions.firestore
  .document('/events/{eventId}')
  .onCreate(async (snapshot, context) => {
    const eventData = snapshot.data();
    const eventName = eventData.name;
    if (eventData.isVisibleToAllSelected == true) {
      const selectedMembers = await getUserFriends(eventData.userId);
      await sendEventNotification(eventData, selectedMembers, eventName);
    } else {
      const selectedMembers = eventData.selectedMembers;
      await sendEventNotification(eventData, selectedMembers, eventName);
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
    const eventName = eventData.name;
    const beforeEventData = snapshot.before.data();
    if (eventData.isVisibleToAllSelected == true) {
      const selectedMembers = await getUserFriends(eventData.userId);
      await sendEventNotification(eventData, selectedMembers, eventName);
    } else {
      if (eventData.selectedMembers.length >= beforeEventData.selectedMembers.length) {
        const selectedMembers = eventData.selectedMembers;
        await sendEventNotification(eventData, selectedMembers, eventName);
      } else {
        console.log("Member has been removed from the event")
      }
    }
    return null;

  });

//*This function will be called when a user sends a friend request to another user.
exports.friendRequestSent = functions.database
  .ref("/friends/{userId}/pendingList/{index}")
  .onCreate(async (snapshot, context) => {
    const friendIndex = context.params.index;
    const userId = context.params.userId;
    try {
      const pendingListRef = admin.database().ref(`/friends/${userId}/pendingList`);
      const pendingListSnapshot = await pendingListRef.once('value');
      const pendingList = pendingListSnapshot.val();
      if (!pendingList) {
        console.log(`Pending friend requests not found for user ${userId}`);
        return null;
      } else {
        const friendId = pendingList[friendIndex];
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
          //!This is the payload which will be sent to the client.
          const payload = {
            message: `You have a new friend request from ${friend.firstName} ${friend.lastName}`,
            userImage: friend.imageUrl,
            visibleTo: userId,
            userId: friendId,
            timeStamp: Date.now(),
          }
          //!This is the message object which will be sent to the client.
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
          //!This is the document reference of the document with document id: - userId.
          const userDocRef = notifications.doc(userId);
          await userDocRef.set({ id: userId }, { merge: true });
          const notificationRef = userDocRef.collection('notificationsList');
          let autoId = notificationRef.doc().id;
          //!This is the notification object which will be stored in the firestore notifications collection inside the userDocRef document.
          const newNotification = {
            type: message.data.type,
            info: JSON.parse(message.data.info),
            id: autoId,
            status: 0,
          }
          await notificationRef.doc(autoId).set(newNotification);
          message.data.info = JSON.stringify(message.data.info);
          return admin.messaging().sendEachForMulticast(message);
        }
      }
    } catch (error) {
      console.log('Error sending message:', error);
    }

    return null;
  });

//*This function will be called when a user accepts a friend request.
exports.friendRequestAccepted = functions.database
  .ref("/friends/{userId}/acceptedList/{index}")
  .onCreate(async (snapshot, context) => {
    const friendIndex = context.params.index;
    const userId = context.params.userId;
    try {
      const acceptedListRef = admin.database().ref(`/friends/${userId}/acceptedList`);
      const acceptedListSnapshot = await acceptedListRef.once('value');
      const acceptedList = acceptedListSnapshot.val();
      if (!acceptedList) {
        console.log(`accepted friend requests not found for user ${userId}`);
        return null;
      } else {
        const friendId = acceptedList[friendIndex];
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
          //!This is the payload which will be sent to the client.
          const payload = {
            message: `${user.firstName} ${user.lastName} has accepted your friend request!`,
            userImage: user.imageUrl,
            visibleTo: friendId,
            userId: userId,
            timeStamp: Date.now()
          }
          //!This is the message object which will be sent to the client.
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
          //!This is the document reference of the document with document id: - friendId.
          const friendDocRef = notifications.doc(friendId);
          await friendDocRef.set({ id: friendId }, { merge: true });
          const notificationRef = friendDocRef.collection('notificationsList');
          let autoId = notificationRef.doc().id;
          //!This is the notification object which will be stored in the firestore notifications collection inside the friendDocRef document.
          const newNotification = {
            type: message.data.type,
            info: JSON.parse(message.data.info),
            id: autoId,
            status: 0,
          }
          await notificationRef.doc(autoId).set(newNotification);
          message.data.info = JSON.stringify(message.data.info);
          return admin.messaging().sendEachForMulticast(message);
        }
      }
    } catch (error) {
      console.log('Error sending message:', error);
    }

    return null;
  });

//! Method to get the user with the given userId.
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

async function getUserFriends(userId) {
  const userFriendsRef = admin.database().ref(`/friends/${userId}/acceptedList`);
  const userFriendsSnapshot = await userFriendsRef.once('value');
  const userFriends = userFriendsSnapshot.val();
  if (!userFriends) {
    console.log(`Friends not found for user ${userId}`);
    return null;
  } else {
    console.log("User Friends", userFriends);
    return userFriends;
  }
}

async function sendEventNotification(eventData, selectedMembers, eventName) {
  try {
    const messagePromises = await selectedMembers.map(async (memberId) => {
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
        } else {
          dateString = "TBD"
        }
        //!This is the payload which will be sent to the client.
        const payload = {
          message: `${user.firstName} ${user.lastName} RSVP’d for ${eventData.name} | ${eventData.startTime} ${dateString}`,
          userImage: user.imageUrl,
          visibleTo: memberId,
          userId: eventData.userId,
          timeStamp: Date.now(),
        }
        //!This is the message object which will be sent to the client.
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
        //!This is the document reference of the document with document id: - memberId.
        const memberDocRef = notifications.doc(memberId);
        await memberDocRef.set({ id: memberId }, { merge: true });
        const notificationRef = memberDocRef.collection('notificationsList');
        let autoId = notificationRef.doc().id;
        //!This is the notification object which will be stored in the firestore notifications collection inside the memberDocRef document.
        const newNotification = {
          type: message.data.type,
          info: JSON.parse(message.data.info),
          id: autoId,
          status: 0,
        }
        await notificationRef.doc(autoId).set(newNotification);
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
}