const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const sdk = require('matrix-js-sdk');
const pointsBot = require('./pointsbot.js');
const chatBot = require('./chatbot.js');
let privateRooms = {};

// If modifying these scopes, delete credentials.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = 'credentials.json';

// Load client secrets from a local file.
fs.readFile('client_secret.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  console.log('Authorizing Google OAuth2 APIs for Google Sheets API');
  // Authorize a client with credentials, then call the Google Sheets API.
  authorize(JSON.parse(content), authenticated);
});

fs.readFile('./privateRooms.json', 'utf8', function(err, data) {
  console.log('Reading privateRooms.json');
  if (!err) {
    privateRooms = JSON.parse(data);
  }
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  console.log('authorize - Creating OAuth2 client');
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) {
      console.log('authorize - Creating new client token');
      return getNewToken(oAuth2Client, callback);
    }
    console.log('authorize - Setting client token stored in credentials.json');
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', code => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return callback(err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), err => {
        if (err) console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

function authenticated(auth) {
  console.log('authenitcated');
  fs.readFile('bot_credentials.json', (err, content) => {
    if (err) return console.log('Error loading bot credentials', err);

    content = JSON.parse(content);

    const client = sdk.createClient(content.base_url);

    client.login(
      'm.login.password',
      {
        user: content.username,
        password: content.password,
      },
      (err, data) => {
        if (err) {
          console.log('Error:', err);
        }

        console.log(`Logged in ${data.user_id} on device ${data.device_id}`);
        const client = sdk.createClient({
          baseUrl: content.base_url,
          accessToken: data.access_token,
          userId: data.user_id,
          deviceId: data.device_id,
        });

        client.on('Room.timeline', (event, room, toStartOfTimeline) => {
          chatBot.handleCalendar(event, room, toStartOfTimeline, client);
          chatBot.handleNewMember(
            event,
            room,
            toStartOfTimeline,
            client,
            privateRooms
          );
          pointsBot.handlePointGiving(
            auth,
            event,
            room,
            toStartOfTimeline,
            client,
            privateRooms,
            chatBot.sendInternalMessage
          );
          chatBot.handleResponse(
            event,
            room,
            toStartOfTimeline,
            client,
            privateRooms
          );
          savePrivateRooms();
        });

        client.startClient(0);
        console.log('Started client');
      }
    );
  });
}

function savePrivateRooms() {
  console.log('savePrivateRooms');
  fs.writeFile(
    './privateRooms.json',
    JSON.stringify(privateRooms, null, 2),
    'utf-8'
  );
}

// Zeit NOW workaround
const http = require('http');
http.createServer(callback).listen(8082);

function callback(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Hello there!');
}
