/// <reference path="../typings/globals/jquery/index.d.ts" />

const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const easyNotes = ["C", "D", "E", "F", "G", "A", "B"];

function randomNote(easy = false) {
  if (easy) {
    let i = Math.floor(Math.random() * 7);
    return easyNotes[i];
  } else {
    let i = Math.floor(Math.random() * 12);
    return notes[i];
  }
}

class NoteRow {
  constructor(rowIndex) {
    this.rowIndex = rowIndex;
    this.guess = ["", "", "", "", ""];
    this.index = 0;
    this.$delBut = $("button.delete");
    this.$subBut = $("button.submit");
    this.$squares = [];
    for (let i = 0; i < 5; i++) {
      let x = this.rowIndex * 5 + i;
      let $sq = $("div.guesses > div.container:eq(" + x + ") > .note");
      this.$squares.push($sq);
    }
  }
  add(note) {
    if (this.index < 5) {
      this.guess[this.index] = note;
      this.index++;
      this.render();
    }
    return this.index;
  }
  delete() {
    if (this.index > 0) {
      this.index--;
      this.guess[this.index] = "";
      this.render();
    }
    return this.index;
  }
  clear() {
    this.submitted = false;
    this.index = 0;
    this.guess = ["", "", "", "", ""];
    for (let i = 0; i < 5; i++) {
      this.$squares[i].removeClass("correct incorrect");
    }
    this.render();
  }
  submit(correctNotes) {
    let correct = true;
    for (let i = 0; i < 5; i++) {
      if (this.guess[i] == correctNotes[i]) {
        this.$squares[i].addClass("correct");
      } else {
        this.$squares[i].addClass("incorrect");
        correct = false;
      }
    }
    this.$delBut.prop("disabled", true);
    this.$subBut.prop("disabled", true);
    return correct;
  }
  render() {
    for (let i = 0; i < 5; i++) {
      this.$squares[i].html(this.guess[i]);
    }
    if (this.index > 0) {
      this.$delBut.prop("disabled", false);
    } else {
      this.$delBut.prop("disabled", true);
    }
    if (this.index < 5) {
      this.$subBut.addClass("hidden");
      this.$subBut.prop("disabled", true);
    } else {
      this.$subBut.removeClass("hidden");
      this.$subBut.prop("disabled", false);
    }
  }
}

class NoteGrid {
  constructor() {
    this.activeRow = 0;
    this.$keyboard = $("div.lower");
    this.$solution = $("div.solution");
    this.$rightNotes = $("div.rightnotes");
    this.rows = [];
    for (let i = 0; i < 6; i++) {
      let x = new NoteRow(i);
      this.rows.push(x);
    }
  }
  add(note) {
    this.rows[this.activeRow].add(note);
  }
  delete() {
    this.rows[this.activeRow].delete();
  }
  submit(correctNotes) {
    let correct = this.rows[this.activeRow].submit(correctNotes);
    this.activeRow++;
    if (correct) {
      this.$keyboard.addClass("finished");
    } else {
      if (this.activeRow > 5) {
        this.$keyboard.addClass("finished");
        //display answer
        for (let i = 0; i < 5; i++) {
          this.$rightNotes.append("<span>" + correctNotes[i] + "</span>");
        }
        this.$solution.show();
      }
    }
  }
  clear() {
    for (let i = 0; i < 6; i++) {
      this.rows[i].clear();
      this.activeRow = 0;
      this.$keyboard.removeClass("finished");
      this.$rightNotes.empty();
      this.$solution.hide();
    }
  }
}

$(document).ready(function () {
  const noteDur = 2; //note sustain time (seconds)
  const noteDel = 500; //time between notes (miliseconds)
  const volume = 0.5; //volume of piano [0-1]

  //initialize the synthesizer upon page load
  var piano = Synth.createInstrument("piano");
  Synth.setSampleRate(40000); // sets sample rate [Hz]
  Synth.setVolume(0.5); // set volume [0-1]

  let melody = []; //stores the correct melody

  //generate the initial melody
  for (let i = 0; i < 5; i++) {
    melody.push(randomNote());
  }
  console.log(melody);

  //Create the objects
  myGrid = new NoteGrid();

  //Play Button Pressed: Play the 5-note melody
  $("button.play").click(function () {
    Synth.setVolume(0);
    piano.play("A", 1, 1);
    Synth.setVolume(volume);
    (function myLoop(i) {
      setTimeout(function () {
        let note = melody[5 - i];
        piano.play(note, 4, noteDur); //  your code here
        if (--i) myLoop(i); //  decrement i and call myLoop again if i > 0
      }, noteDel);
    })(5);
  });

  //C Reference Button Pressed: Play C4 note
  $("button.reference").click(function () {
    piano.play("C", 4, noteDur);
  });

  //Piano Key Pressed: Put the note in the next box unless we are at the end of the row
  $("button.key").click(function () {
    let keyPressed = $(this).html();
    myGrid.add(keyPressed);
  });

  //Delete Button Pressed: delete the most recently entered note
  $("button.delete").click(function () {
    myGrid.delete();
  });

  //Submit Button Pressed: grade the current guess
  $("button.submit").click(function () {
    myGrid.submit(melody);
  });

  //Hard Button Pressed: create new hard game
  $("button.hard").click(function () {
    $(this).addClass("selected");
    $("button.easy").removeClass("selected");
    myGrid.clear();
    $("button.sharp").prop("disabled", false);
    $("button.esharp").prop("disabled", true);
    //generate a new melody
    melody = [];
    for (let i = 0; i < 5; i++) {
      melody.push(randomNote());
    }
    console.log(melody);
  });

  //Easy Button Pressed: create new easy game
  $("button.easy").click(function () {
    $(this).addClass("selected");
    $("button.hard").removeClass("selected");
    myGrid.clear();
    $("button.sharp").prop("disabled", true);
    //generate a new melody
    melody = [];
    for (let i = 0; i < 5; i++) {
      melody.push(randomNote(true)); //true means easy
    }
    console.log(melody);
  });
});
