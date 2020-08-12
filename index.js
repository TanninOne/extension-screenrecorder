// javascript because a bunch of the apis we use have to typings so that would just be tedious

const { desktopCapturer, Menu, MenuItem, remote } = require('electron');
const path = require('path');
const { fs, log, util } = require('vortex-api');

const NOTIFICATION_ID = 'window-recording';

let recorder;

function timeTag(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
}

async function startRecording(api) {
  recordingTime = new Date();

  try {
    const sources = await desktopCapturer.getSources({ types: ['window'] });
    const vortexWindows = sources.filter(iter => iter.name === 'Vortex');

    if (vortexWindows.length > 1) {
      log('info', 'multiple vortex windows?', vortexWindows);
    } else if (vortexWindows.length === 0) {
      api.showErrorNotification('recording failed', 'found no Vortex window');
      return;
    }

    const [width, height] = remote.getCurrentWindow().getSize();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: vortexWindows[0].id,
          minWidth: width,
          maxWidth: width,
          minHeight: height,
          maxHeight: height,
        },
      },
    });

    // TODO: configurable bitrate?
    const options = {
      mimeType: 'video/webm; codecs=vp9',
      videoBitsPerSecond: 400000,
    };
    recorder = new MediaRecorder(stream, options);
    const startTime = new Date();
    const filePath = path.join(util.getVortexPath('temp'),
      `recording_${timeTag(startTime)}.webm`);

    recorder.onstart = () => {
      log('debug', 'recording started');
      api.sendNotification({
        id: NOTIFICATION_ID,
        type: 'activity',
        message: 'Recording',
      });
    };
    recorder.onstop = () => {
      log('debug', 'recording stopped', filePath);
      api.sendNotification({
        id: NOTIFICATION_ID,
        type: 'success',
        title: 'Video recorded',
        message: filePath,
      });
      recorder = undefined;
    };
    recorder.ondataavailable = async (event) => {
      log('debug', 'writing recorded video');
      await fs.writeFileAsync(filePath, Buffer.from(await event.data.arrayBuffer()));
    };
    recorder.onerror = (event) => {
      log('error', 'Failed to capture', event);
      api.sendNotification({
        id: NOTIFICATION_ID,
        type: 'error',
        title: 'Failed to capture',
        message: filePath,
      });
    };
    recorder.start();
  } catch (err) {
    console.error('capture failed', err);
  }
}

function stopRecording(api) {
  if (recorder.state === 'recording') {
    recorder.stop();
  }
}


function toggleRecording(api) {
  if (recorder === undefined) {
    startRecording(api);
  } else {
    stopRecording(api);
  }
}

function setupMenu(api, attempt) {
  const menu = remote.Menu.getApplicationMenu();
  // silly hack, to wait until the custom Vortex menu has actually been set up, we expect to not
  // see an "Edit" menu in the custom one
  if ((menu.items.find(iter => iter.label === 'Edit') !== undefined) && (attempt < 100)) {
    setTimeout(() => setupMenu(api, attempt + 1), 100);
  } else {
    log('debug', 'updating menu on attempt', attempt);
    menu.append(new remote.MenuItem({
      label: 'Recording',
      submenu: [
        {
          label: 'Toggle Screen Recording',
          accelerator: 'CmdOrCtrl+R',
          click: () => { toggleRecording(api) },
        },
      ]
    }));
    remote.Menu.setApplicationMenu(menu);
  }
}

function main(context) {
  context.once(() => {
    setupMenu(context.api, 0);
  });

  return true;
}

module.exports = {
  default: main,
};

