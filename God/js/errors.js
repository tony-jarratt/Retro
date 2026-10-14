'use strict';

// Typed errors, so a caller can respond to the kind of problem instead of reading a message.
// Every error has a short `kind` (for example 'off-map') and a message with the details.
class GodError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = this.constructor.name;
    this.kind = kind;
  }
}

class TerrainError extends GodError {} // a corner or tile off the map, or a malformed heightmap
class WorldError extends GodError {}   // a walker, house or tribe that does not exist
class RulesError extends GodError {}   // a game state that should be impossible (an invariant broken)
