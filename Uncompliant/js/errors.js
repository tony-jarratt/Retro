'use strict';

// Typed errors, so a caller can respond to the kind of problem instead of reading a message.
// Every error has a short `kind` (for example 'checksum') and a message with the details.
class UncompliantError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = this.constructor.name;
    this.kind = kind;
  }
}

class MapError extends UncompliantError {}       // a map that is malformed or a hex that is off the map
class BuildError extends UncompliantError {}     // a mech or squad that breaks the build rules
class PlanError extends UncompliantError {}      // a move or fire plan the rules cannot carry out
class RulesError extends UncompliantError {}     // a game state that should be impossible
class BuildCodeError extends UncompliantError {} // a squad code that cannot be read
