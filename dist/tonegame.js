/// <reference path="../typings/globals/jquery/index.d.ts" />

const DEBUG = true;
window.AudioContext = window.AudioContext || window.webkitAudioContext;

//canvas constants
const canvasHeight = 500; //px
const scopeHeight = 200; //px
var canvasLeftMargin = 200; //pixels between left of canvas and time=0 line
const ppms = 0.05; //canvas pixels per ms
var timePerNote = 1000; //ms
var timePerRest = 1000; //ms
if (DEBUG) {
  timePerNote = 500; //ms
  timePerRest = 500; //ms
}
const initialRest = 1000; //ms
const finishRest = 2000; //ms
const staffColors = ["LimeGreen", "gray", "salmon", "gray", "yellow", "DeepSkyBlue", "gray", "crimson", "gray", "orange", "gray", "violet"];
const noteColors = ["LimeGreen", "salmon", "yellow", "DeepSkyBlue", "crimson", "orange", "violet"];
const notePosition = [0, 1, 3, 5, 6, 8, 10, 12, 13, 15, 17, 18, 20, 22, 24, 25];
const rowHeight = 20;
const noteWidth = timePerNote * ppms;
const noteHeight = 16;

//canvas/animation variables
var staffCanvas, gameCanvas, scopeCanvas, freqCanvas, canvasWidth, dpr;
var myAniReq = null;

//jquery variables
var $score, $progress, $staff, $game, $board, $scope, $startgame, $newgame, $stopgame, $resettab, $customtab, $freqscope;
var $notesel, $debuginfo, $newtab, $settingstab, $helptab, $showsettings, $scorelist, $levelgrid;

//variables for audiocontext and playing tones
var audioContext = null;
var stream = null;
var analyser = null;
var mediaStreamSource = null;
var detectPitch = null;
var piano = null;
const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

//pitch variables
const pitchAvgLength = 5;
var pitchArray = [];
var arrowPosition = 250; //position of the arrow at start of game. Updates as game is played
const pitchFoundThresh = 5; //how many samples have to be null before we consider no pitch found
var pitchFound = 0; //countdown until we consider no pitch found (resets to pitchFoundThresh when detected)

//song variables
var notes = []; //8=tonic
var tonic = null; //C4=60
var userMiddleNote = 57;
var startTime = null;
var finishTime = null;
var time = null;
var currentNote = 0;
var prevNote = 0;
var selectedLevel = 0;
var restInterval = 4; //notes between each rest

//scoring variables
var noteScoreArray = [];
var currentScore = 0;
var currentProgress = 0;
const perfScoreVal = 0.7; //How accurate does the note have to be to count as perfect [0-2]

//scope variables
var xdata = [];
var ydata = [];

$(document).ready(function () {
  //find jquery elements
  $staff = $("#staff");
  $game = $("#game");
  $scope = $("#scope");
  $freqscope = $("#freq");
  $board = $(".board");
  $score = $(".score");
  $progress = $(".progress");
  $startgame = $(".startgame");
  $showsettings = $(".showsettings");
  $newgame = $(".newgame");
  $stopgame = $(".stopgame");
  $notesel = $(".notesel");
  $debuginfo = $(".debuginfo");
  $newtab = $(".newtab");
  $settingstab = $(".settingstab");
  $resettab = $(".resettab");
  $helptab = $(".helptab");
  $scorelist = $(".scorelist");
  $customtab = $(".customtab");
  $levelgrid = $(".levelgrid");

  dpr = window.devicePixelRatio || 1;
  let w = window.innerWidth;
  canvasWidth = Math.min(w - 20, 800);
  $board.width(canvasWidth);
  $staff[0].width = canvasWidth * dpr;
  $game[0].width = canvasWidth * dpr;
  $staff[0].height = canvasHeight * dpr;
  $game[0].height = canvasHeight * dpr;
  $staff[0].style.width = canvasWidth + "px";
  $game[0].style.width = canvasWidth + "px";
  $staff[0].style.height = canvasHeight + "px";
  $game[0].style.height = canvasHeight + "px";

  $scope[0].width = canvasWidth * dpr;
  $scope[0].height = scopeHeight * dpr;
  $scope[0].style.width = canvasWidth + "px";
  $scope[0].style.height = scopeHeight + "px";
  scopeCanvas = $scope[0].getContext("2d");
  scopeCanvas.scale(dpr, dpr);
  $freqscope[0].width = canvasWidth * dpr;
  $freqscope[0].height = scopeHeight * dpr;
  $freqscope[0].style.width = canvasWidth + "px";
  $freqscope[0].style.height = scopeHeight + "px";
  freqCanvas = $freqscope[0].getContext("2d");
  freqCanvas.scale(dpr, dpr);

  gameCanvas = $game[0].getContext("2d");
  gameCanvas.scale(dpr, dpr);
  staffCanvas = $staff[0].getContext("2d");
  staffCanvas.scale(dpr, dpr);
  canvasLeftMargin = Math.min(200, Math.round(canvasWidth / 2));
  drawStaff();

  //initialize the synthesizer upon page load
  piano = Synth.createInstrument("piano");
  Synth.setSampleRate(48000); // sets sample rate [Hz]
  Synth.setVolume(0.5); // set volume [0-1]

  //load cookies
  let firstvisit = loadCookies();
  if (firstvisit) {
    hideTabs();
    $helptab.show();
  }

  $stopgame.click(function () {
    stopGame();
  });

  $newgame.click(function () {
    hideTabs();
    loadCookies();
    $newtab.show();
  });

  $startgame.click(function () {
    hideTabs();
    startGame(false, false);
  });

  $("button.customlevel").click(function () {
    $customtab.show();
    $levelgrid.hide();
    $(this).addClass("active").removeClass("inactive");
    $("button.standardlevel").addClass("inactive").removeClass("active");
  });

  //don't allow random start note when return to tonic is enabled
  $("select.returntonicsel").on("change", "", function (e) {
    var valueSelected = this.value;
    console.log(valueSelected);
    if (valueSelected > 500) {
      $("select.startnotesel").prop("disabled", false);
    } else {
      $("select.startnotesel").prop("disabled", true);
      $("select.startnotesel").val("0");
    }
  });

  $("button.standardlevel").click(function () {
    $levelgrid.show();
    $customtab.hide();
    $(this).addClass("active").removeClass("inactive");
    $("button.customlevel").addClass("inactive").removeClass("active");
  });

  $("button.startcustom").click(function () {
    selectedLevel = 0;
    console.log("Level: Custom");
    hideTabs();
    startGame(true, true);
  });

  $("button.levelsel").click(function () {
    selectedLevel = parseInt($(this).val());
    console.log("Level: " + selectedLevel);
    hideTabs();
    startGame(true, false);
  });

  $("button.applysettings").click(function () {
    userMiddleNote = parseInt($notesel.val());
    console.log("Middle Note: " + userMiddleNote);
    Cookies.set("middlenote", userMiddleNote, { expires: 3650 });
    hideTabs();
  });

  $showsettings.click(function () {
    hideTabs();
    loadCookies();
    $settingstab.show();
  });

  $("button.resetprog").click(function () {
    $resettab.show();
  });

  $("button.confirmreset").click(function () {
    clearProgress();
    hideTabs();
  });

  $("button.showhelp").click(function () {
    hideTabs();
    $helptab.show();
  });

  $("button.closetab").click(function () {
    hideTabs();
  });
});

function renderFrame() {
  if (startTime != null) {
    //figure out time step since start of game
    time = new Date().getTime();
    let dt = time - startTime;

    //clear old canvas
    gameCanvas.clearRect(0, 0, canvasWidth, canvasHeight);

    //draw notes
    currentNote = 0;
    let noteCenter = -100;
    gameCanvas.lineWidth = 1;
    gameCanvas.strokeStyle = "black";
    for (let i = 0; i < notes.length; i++) {
      let myNote = notes[i];
      let myNoteRel = ((myNote - 1) % 7) + 1;
      let myColor = noteColors[myNoteRel - 1];
      let numRests = Math.floor(i / restInterval);
      let myX = canvasLeftMargin + (initialRest + numRests * timePerRest - dt) * ppms + i * noteWidth;
      let myY = canvasHeight - notePosition[myNote] * rowHeight + (rowHeight - noteHeight) / 2;
      let myWidth = noteWidth;
      let myHeight = rowHeight * 0.8;
      if (myX > -noteWidth && myX < canvasWidth) {
        //only draw the notes that are on screen
        gameCanvas.fillStyle = myColor;
        gameCanvas.beginPath();
        gameCanvas.rect(myX, myY, myWidth, myHeight);
        gameCanvas.fill();
        gameCanvas.stroke();
        gameCanvas.fillStyle = "black";
        gameCanvas.font = "16px Arial";
        gameCanvas.fillText(myNoteRel, myX + 10, myY + 14);
      }
      //see if the note is currently the active note
      if (myX < canvasLeftMargin && myX + myWidth > canvasLeftMargin) {
        currentNote = myNote;
        noteCenter = myY + noteHeight / 2;
      }
    }
    //calculate current pitch
    let noteScaled = null;
    if (pitchArray.length > 0) {
      let myPitch = calcAvgPitch();
      // if (DEBUG) $debuginfo.html(noteNameFromNum(Math.round(myPitch)));
      noteScaled = canvasHeight - 10 - (myPitch - tonic + 12) * rowHeight;
      arrowPosition = Math.min(Math.max(noteScaled, 0), canvasHeight); //clip to available canvas
      //arrow Position only updates if pitchArray is not empty
    }
    xdata.push(canvasLeftMargin + dt * ppms);
    ydata.push(noteScaled);

    //calculate whether it is currently scoring
    let scoring = 0;
    if (arrowPosition < noteCenter + 5 && arrowPosition > noteCenter - 5 && pitchFound > 0) {
      scoring = 2;
    } else if (arrowPosition < noteCenter + 10 && arrowPosition > noteCenter - 10 && pitchFound > 0) {
      scoring = 1;
    }
    //if current note is new, then calculate the previous note's score
    if (currentNote != prevNote) {
      if (prevNote > 0) {
        // only score the previous note if it was not a rest
        let noteScore = 0;
        for (var i = 0; i < noteScoreArray.length; i++) {
          noteScore = noteScore + noteScoreArray[i];
        }
        noteScore = Math.min(noteScore / noteScoreArray.length, perfScoreVal); //don't let it go over the max score value
        //scale it to a percentage of the total
        let scaledScore = ((noteScore / perfScoreVal) * 100) / notes.length;
        currentScore = currentScore + scaledScore;
        currentProgress = currentProgress + 100 / notes.length;
      }
      noteScoreArray = [];
    }
    //then append the new score if we are not on a rest currently
    if (currentNote > 0) {
      noteScoreArray.push(scoring);
    }
    prevNote = currentNote;

    //update game info
    let scorestr = currentScore.toFixed(currentScore > 99.95 ? 0 : 1) + "%";
    let progstr = currentProgress.toFixed(currentProgress > 99.95 ? 0 : 1) + "%";
    $score.html(scorestr);
    $progress.html(progstr);

    //draw scope
    let xdata_shift = xdata.map((x) => x - dt * ppms);
    let drawing = false;
    gameCanvas.lineWidth = 3;
    gameCanvas.beginPath();
    for (let i = 0; i < xdata_shift.length; i++) {
      if (ydata[i] == null) {
        drawing = false;
      } else {
        if (!drawing) {
          gameCanvas.moveTo(xdata_shift[i], ydata[i]);
          drawing = true;
        } else {
          gameCanvas.lineTo(xdata_shift[i], ydata[i]);
        }
      }
    }
    gameCanvas.stroke();

    //delete old samples if they are now off screen
    if (xdata_shift[0] < 0) {
      xdata.shift();
      ydata.shift();
    }

    //draw arrow
    if (scoring > 0) {
      gameCanvas.strokeStyle = "black";
      gameCanvas.fillStyle = "green";
    } else {
      gameCanvas.strokeStyle = "black";
      gameCanvas.fillStyle = "black";
    }
    gameCanvas.lineWidth = 1;
    gameCanvas.beginPath();
    gameCanvas.moveTo(canvasLeftMargin, arrowPosition);
    gameCanvas.lineTo(canvasLeftMargin - 20, arrowPosition + 10);
    gameCanvas.lineTo(canvasLeftMargin - 20, arrowPosition - 10);
    gameCanvas.lineTo(canvasLeftMargin, arrowPosition);
    gameCanvas.fill();
    gameCanvas.stroke();

    //see if the game is over
    if (dt > finishTime && !DEBUG) {
      stopGame();
    }
  }
}

async function startGame(newgame, custom) {
  let connection = false;
  connection = await getMedia(); //get the microphone working
  if (connection) {
    stopSong();
    $startgame.prop("disabled", true);
    $newgame.prop("disabled", true);
    $showsettings.prop("disabled", true);
    //reset everything
    currentScore = 0;
    currentProgress = 0;
    prevNote = 0;
    xdata = [];
    ydata = [];
    pitchFound = 0;
    $score.html("--");
    $progress.html("--");
    if (newgame || notes.length < 1) {
      if (custom) {
        genMelody();
      } else {
        let level = selectedLevel;
        console.log("Level: " + level);
        getMelody(level); //generate the melody notes
      }
    }

    //set the tonic to get midpoint = userMiddleNote
    let maxNote = Math.max(...notes);
    let minNote = Math.min(...notes);
    let midPoint = Math.round((notePosition[maxNote] + notePosition[minNote]) / 2);
    tonic = userMiddleNote - (midPoint - notePosition[8]);
    console.log("Middle Note: " + noteNameFromNum(userMiddleNote));
    console.log("Tonic Note: " + noteNameFromNum(tonic));
    console.log("Notes: " + notes.map((x) => noteNameFromNum(notePosition[x] - notePosition[8] + tonic)));
    console.log(notes);
    console.log("Number of Notes: " + notes.length);

    //play the cadence
    if (!DEBUG) {
      playCadence();
      setTimeout(function () {
        startSong();
        myAniReq = window.requestAnimationFrame(drawGame);
        $stopgame.prop("disabled", false);
      }, 5000);
    } else {
      startSong();
      myAniReq = window.requestAnimationFrame(drawGame);
      $stopgame.prop("disabled", false);
    }
  }
}

function startSong() {
  startTime = new Date().getTime();
  let numNotes = notes.length;
  let numRests = Math.floor(numNotes / restInterval);
  finishTime = initialRest + numRests * timePerRest + numNotes * timePerNote + finishRest;
}

function stopGame() {
  $stopgame.prop("disabled", true);
  $startgame.prop("disabled", false);
  $newgame.prop("disabled", false);
  $showsettings.prop("disabled", false);
  if (stream != null) {
    stream.getAudioTracks().forEach((track) => {
      track.stop();
    });
    console.log("stopping mic");
    stream = null;
    audioContext.close();
  }
  //save score
  let bestScore = Cookies.get(selectedLevel);
  if (bestScore == undefined || currentScore > bestScore) {
    Cookies.set(selectedLevel, Math.round(currentScore * 10) / 10, { expires: 3650 });
  }
  stopSong();
}

function stopSong() {
  startTime = null;
  gameCanvas.clearRect(0, 0, canvasWidth, canvasHeight);
  window.cancelAnimationFrame(myAniReq);
}

function getMelody(level) {
  //for predefined levels
  restInterval = 4;
  notes = [];
  switch (level) {
    case 1: //start tonic, single steps, tonic to tonic+8
      notes = [8, 9, 10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10, 9, 8];
      break;
    case 2: //start tonic, single steps, tonic to tonic-8
      notes = [8, 7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7, 8];
      break;
    case 3:
      notes = [8, 9, 10, 11, 12, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10, 9, 10, 9, 8];
      break;
    case 4:
      notes = [8, 9, 10, 11, 12, 11, 10, 9, 8, 7, 6, 5, 6, 7, 8, 9, 10, 9, 8, 7, 8];
      break;
    case 5:
      notes = [8, 9, 8, 7, 6, 5, 6, 7, 8, 9, 10, 11, 12, 11, 10, 9, 8, 7, 6, 5];
      break;
    case 6:
      notes = [8, 10, 12, 15, 12, 10, 8, 9, 10, 11, 12, 11, 10, 9, 8, 12, 8];
      break;
    case 7:
      notes = [8, 5, 3, 1, 2, 3, 4, 5, 8, 7, 6, 5, 3, 1, 5, 8, 5, 6, 7, 8];
      break;
    case 8:
      notes = [1, 3, 5, 8, 10, 12, 11, 10, 9, 8, 7, 6, 5, 8, 12, 8, 5, 1, 3, 5, 8];
      break;
    case 9:
      notes = [5, 8, 10, 8, 10, 12, 15, 14, 13, 12, 8, 7, 6, 5, 8, 9, 10, 11, 12, 8];
      break;
    case 10:
      notes = [8, 11, 12, 15, 14, 13, 8, 7, 6, 5, 12, 10, 8, 5, 7, 8, 15, 14, 13, 8];
      break;
    case 11:
      notes = [8, 4, 2, 1, 3, 4, 5, 7, 8, 9, 11, 10, 8, 6, 4, 2, 1, 3, 5, 7, 8];
      break;
    case 12:
      notes = [5, 3, 8, 7, 6, 4, 2, 1, 8, 12, 15, 14, 13, 8, 1, 3, 4, 11, 9, 8];
      break;
    case 13:
      notes = [12, 9, 11, 12, 15, 8, 1, 3, 10, 5, 7, 8, 15, 12, 8, 3, 2, 1, 5, 8];
      break;
    case 14:
      notes = [8, 14, 10, 7, 2, 5, 10, 15, 13, 6, 2, 1, 6, 4, 5, 8, 11, 4, 6, 7, 8];
      break;
    case 15:
      notes = [2, 6, 3, 12, 9, 3, 5, 12, 15, 9, 3, 7, 12, 14, 15, 12, 7, 8, 14, 7, 4, 8];
      break;
  }
}

function genMelody() {
  //for custom levels
  let possibleNotes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  let minArray = [1, 5, 8];
  let maxArray = [8, 12, 15];

  let minSel = parseInt($(".minsel").val()); //octave below, 5th below, tonic
  let maxSel = parseInt($(".maxsel").val()); //tonic, 5th above, octave above
  let noteTypeSel = parseInt($(".notetypesel").val());
  let maxJump = parseInt($(".jumpsel").val()); //options: 1, 2, 3, 4, 7, or 14
  let startSel = parseInt($(".startnotesel").val()); //tonic, random
  let melodyLength = parseInt($(".lengthsel").val());
  let restsel = parseInt($(".restsel").val());
  let returntonic = parseInt($(".returntonicsel").val());

  restInterval = restsel;

  let minNote = minArray[minSel];
  let maxNote = maxArray[maxSel];

  //first filter by the type of notes allowed
  switch (noteTypeSel) {
    case 0: //7,1,2,3
      possibleNotes = [1, 2, 3, 7, 8, 9, 10, 14, 15];
      break;
    case 1: //1,3,5
      possibleNotes = [1, 3, 5, 8, 10, 12, 15];
      break;
    case 2: //1,2,3,4,5
      possibleNotes = [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 15];
      break;
    case 3: //all notes
      possibleNotes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
      break;
  }
  //then filter by the max and min notes
  possibleNotes = possibleNotes.filter(function (x) {
    return x >= minNote && x <= maxNote;
  });
  let numPosNotes = possibleNotes.length;
  console.log("Possible Notes: " + possibleNotes);
  console.log("Max Jump: " + maxJump);
  maxNote = possibleNotes[numPosNotes - 1];
  minNote = possibleNotes[0];

  //set starting note
  let thisNote = 8;
  if (startSel > 0) {
    //choose a random starting note
    thisNote = possibleNotes[getRandomInt(0, numPosNotes - 1)];
  }

  //fill the note array
  notes = [];
  for (let i = 0; i < melodyLength; i++) {
    notes.push(thisNote);
    if (numPosNotes > 1) {
      //only change the note if we have more than 1 note to pick from
      let direction = stepUpDown() ? 1 : 2; // 1 = up, 2 = down
      //find note above and below this one
      let thisNoteIndex = possibleNotes.indexOf(thisNote);
      let noteAbove = possibleNotes[thisNoteIndex + 1];
      let noteBelow = possibleNotes[thisNoteIndex - 1];
      //check if stepping up is possible
      if (thisNote == maxNote || noteAbove - thisNote > maxJump) {
        direction = 2; //have to step down
      }
      //check if stepping down is possible
      if (thisNote == minNote || thisNote - noteBelow > maxJump) {
        direction = 1; //have to step up
      }
      //see if we can step at all
      if ((thisNote == maxNote || noteAbove - thisNote > maxJump) && (thisNote == minNote || thisNote - noteBelow > maxJump)) {
        direction = 0; //can't step at all
      }

      //figure out which note to jump to
      if (direction == 1) {
        //find highest note we can jump to that meets criteria
        let highNote = thisNote + maxJump;
        let highestIndex = possibleNotes.indexOf(highNote);
        while (highestIndex < 0) {
          highNote--;
          highestIndex = possibleNotes.indexOf(highNote);
        }
        //pick a note index between the current note+1 and highNote
        thisNote = possibleNotes[getRandomInt(thisNoteIndex + 1, highestIndex)];
      } else if (direction == 2) {
        //find lowest note we can jump to that meets criteria
        let lowNote = thisNote - maxJump;
        let lowestIndex = possibleNotes.indexOf(lowNote);
        while (lowestIndex < 0) {
          lowNote++;
          lowestIndex = possibleNotes.indexOf(lowNote);
        }
        //pick a note index between the current note-1 and lowNote
        thisNote = possibleNotes[getRandomInt(thisNoteIndex - 1, lowestIndex)];
      }
      //if force return to tonic is set, override with the tonic
      if ((i + 1) % returntonic == 0) {
        thisNote = 8;
      }
    }
  }

  function stepUpDown() {
    //randomly returns true or false
    return Math.random() < 0.5;
  }

  function getRandomInt(min, max) {
    //inclusive of min and max
    return Math.floor(Math.random() * (max + 1 - min) + min);
  }
}

function playCadence() {
  //play the cadance
  playNote(tonic);
  playNote(tonic + 4);
  playNote(tonic + 7);
  setTimeout(function () {
    playNote(tonic);
    playNote(tonic + 5);
    playNote(tonic + 9);
  }, 1000);
  setTimeout(function () {
    playNote(tonic - 1);
    playNote(tonic + 2);
    playNote(tonic + 7);
  }, 2000);
  setTimeout(function () {
    playNote(tonic);
    playNote(tonic + 4);
    playNote(tonic + 7);
  }, 3000);
  setTimeout(function () {
    playNote(tonic);
  }, 4000);
}

function playNote(noteNum) {
  let noteName = noteStrings[noteNum % 12];
  let noteNumber = Math.floor(noteNum / 12) - 1;
  piano.play(noteName, noteNumber, 2);
}

async function getMedia() {
  if (stream == null) {
    try {
      audioContext = new AudioContext();

      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      let preferedID = "default";
      let preferedLabel = "asdf";

      let devices = await navigator.mediaDevices.enumerateDevices();
      console.log(devices);
      for (let i = 0; i < devices.length; i++) {
        if (devices[i].kind == "audioinput") {
          $debuginfo.append("<p>" + devices[i].label + "</p>");
          if (devices[i].label.includes(preferedLabel)) {
            preferedID = devices[i].deviceId;
          }
        }
      }

      stream = await navigator.mediaDevices.getUserMedia({
        // audio: { deviceId: preferedID, autoGainControl: false, echoCancellation: false, noiseSuppression: false },
        audio: {
          mandatory: {
            googEchoCancellation: "false",
            googAutoGainControl: "false",
            googNoiseSuppression: "false",
            googHighpassFilter: "false",
          },
          optional: [],
        },
        video: false,
      });

      console.log("connected to: " + stream.getAudioTracks()[0].label);
      console.log("properties: " + stream.getAudioTracks()[0].getConstraints());
      $debuginfo.append("<p>connected to: " + stream.getAudioTracks()[0].label + "</p>");

      // Create an AudioNode from the stream.
      mediaStreamSource = audioContext.createMediaStreamSource(stream);
      sampleRate = audioContext.sampleRate;
      console.log(sampleRate);

      // Connect it to the destination.
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      mediaStreamSource.connect(analyser);

      // Initialize the pitch detector
      detectPitch = AMDF({
        sampleRate: sampleRate,
        minFrequency: 78,
        maxFrequency: 1000,
        ratio: 5,
        sensitivity: 0.1,
      });

      return true;
    } catch (err) {
      console.log("failed to get stream");
      alert(
        "Can't access microphone. Make sure you allow microphone access, and nothing else is using the microphone. \nIf this still doesn't work, you may need to restart your device."
      );
      return false;
    }
  }
}

function hideTabs() {
  $newtab.hide();
  $settingstab.hide();
  $helptab.hide();
  $resettab.hide();
}

function clearProgress() {
  console.log("clearing progress");
  var count = $(".scorelist").children().length;
  for (let i = 1; i <= count; i++) {
    Cookies.remove(i);
  }
}

function loadCookies() {
  //First load any saved settings
  let firstvisit = false;
  userMiddleNote = Cookies.get("middlenote");
  if (userMiddleNote == undefined) {
    firstvisit = true;
    userMiddleNote = 57; //default to A3
    Cookies.set("middlenote", userMiddleNote, { expires: 3650 });
  } else {
    userMiddleNote = parseInt(Cookies.get("middlenote"));
  }
  $notesel.val(userMiddleNote);

  //Then load Scores
  var count = $(".scorelist").children().length;
  for (let i = 1; i <= count; i++) {
    let myScore = Cookies.get(i);
    if (myScore != undefined) {
      myScore = parseFloat(myScore);
      $(".scorelist")
        .children()
        .eq(i)
        .html(myScore.toFixed(myScore > 99.95 ? 0 : 1) + "%");
    } else {
      $(".scorelist").children().eq(i).html("--");
    }
  }

  //let the page know if it is the user's first visit
  return firstvisit;
}

function updatePitch() {
  const array32 = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(array32);

  var pitch = detectPitch(array32);

  if (pitch == null) {
    pitchFound--; //subtract one from pitchFound counter
    if (pitchFound < 1) {
      pitchArray = []; //reset the pitchArray when pitchFound = 0
    }
  } else {
    pitchFound = pitchFoundThresh; //reset counter when pitch is found
    let x = noteNumFromPitch(pitch);
    pitchArray.push(x);
    if (pitchArray.length > pitchAvgLength) {
      pitchArray.shift();
    }
  }

  //Draw scope
  let multiple = Math.ceil(array32.length / canvasWidth);
  scopeCanvas.clearRect(0, 0, canvasWidth, scopeHeight);
  scopeCanvas.beginPath();
  scopeCanvas.lineWidth = 1;
  scopeCanvas.strokeStyle = "red";
  scopeCanvas.moveTo(0, scopeHeight / 2);
  scopeCanvas.lineTo(canvasWidth, scopeHeight / 2);
  scopeCanvas.stroke();
  scopeCanvas.lineWidth = 1;
  scopeCanvas.strokeStyle = "black";
  scopeCanvas.moveTo(0, 0);
  scopeCanvas.beginPath();
  for (let i = 0; i < array32.length / multiple; i++) {
    scopeCanvas.lineTo(i, scopeHeight * (0.5 + array32[i * multiple] / 2));
  }
  scopeCanvas.stroke();
}

function calcAvgPitch() {
  let myPitch = 0;
  var total = 0;
  var minval = Infinity;
  var maxval = -Infinity;
  for (var i = 0; i < pitchArray.length; i++) {
    tempval = pitchArray[i];
    total += tempval;
    if (tempval < minval) minval = tempval;
    if (tempval > maxval) maxval = tempval;
  }
  if (pitchArray.length < pitchAvgLength) {
    myPitch = total / pitchArray.length;
  } else {
    myPitch = (total - minval - maxval) / (pitchArray.length - 2);
  }
  return myPitch;
}

function drawStaff() {
  staffCanvas.clearRect(0, 0, canvasWidth, canvasHeight);
  const numbers = ["1", " ", "2", " ", "3", "4", " ", "5", " ", "6", " ", "7"];
  const rows = 25;
  for (let i = 0; i < rows; i++) {
    staffCanvas.fillStyle = staffColors[i % 12];
    staffCanvas.globalAlpha = 0.4;
    staffCanvas.fillRect(0, (rows - i - 1) * rowHeight, canvasWidth, rowHeight);
    staffCanvas.fillStyle = "black";
    staffCanvas.font = "18px Arial";
    staffCanvas.globalAlpha = 1;
    staffCanvas.fillText(numbers[i % 12], 10, (rows - i) * rowHeight - 4);
  }
  staffCanvas.globalAlpha = 1;
  staffCanvas.fillStyle = "black";
  staffCanvas.lineWidth = 2;
  staffCanvas.beginPath();
  staffCanvas.moveTo(canvasLeftMargin, 0);
  staffCanvas.lineTo(canvasLeftMargin, canvasHeight);

  staffCanvas.stroke();
}

function drawGame() {
  renderFrame();
  updatePitch();
  myAniReq = window.requestAnimationFrame(drawGame);
}

function noteNumFromPitch(frequency) {
  // C4 = 60 A3 = 57
  var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
  return noteNum + 69;
}

function noteNameFromNum(noteNum) {
  let noteName = noteStrings[noteNum % 12];
  let noteNumber = Math.floor(noteNum / 12) - 1;
  return noteName + noteNumber;
}

function frequencyFromNoteNumber(noteNum) {
  return 440 * Math.pow(2, (note - 69) / 12);
}
