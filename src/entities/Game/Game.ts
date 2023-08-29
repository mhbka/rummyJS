//necessary objects
import * as GameStatus from "./GameStatus.js";
import { GameScore } from "./GameScore.js";
import { Logger } from "../Logger/Logger.js";
import { Player } from "../Player/Player.js";
import { PokerDeck } from "../PokerDeck/PokerDeck.js";
import { Card } from "../PokerDeck/Card.js";
import { Meld } from "../Meld/Meld.js";

//some auxiliary functions
import { loadConfigFile } from "./auxiliary/loadConfig.js";
import { setCardsToDealAndNumberOfDecks, setCardsToDraw, setCardsToDrawDiscardPile, setJokerOption, setWildcardOption } from "./auxiliary/setGameOptions.js";
import { validateAndSortMeld } from "../Meld/validateAndSortMeld.js"; 

//path functions, for getting config file regardless of variant location
import * as path from 'path';
import { fileURLToPath } from 'url';


interface GameOptions {
    useWildcard?: boolean,
    useJoker?: boolean,
    cardsToDraw?: number,
    cardsToDrawDiscardPile?: number|"all",
    cardsToDeal?: number,
    numberOfDecks?: number
}



/** Represents a game of Rummy. */
export class Game {
    /// Properties ///


    /** The variant title; used for accessing the variant's config file too. */
    readonly title = "Rummy"; 
    /** An enum of possible game statuses. */
    GameStatus = GameStatus.GameStatus;
    /** Default configuration for the variant. */
    protected config: any;

    //Options that can be changed by passing in GameOptions in the constructor.
    protected useWildcard: boolean;
    protected useJoker: boolean;
    protected cardsToDraw: number;
    protected cardsToDrawDiscardPile: number|"all";
    protected cardsToDeal: number;
    protected numberOfDecks: number;

    //Used for game tracking
    readonly gameId: string;
    protected logger: Logger;
    protected players: Player[];
    protected quitPlayers: Player[];
    protected initialOptions: GameOptions|undefined;
    protected score: GameScore;

    //Used for game tracking, public for 
    currentPlayerIndex: number;
    currentRound: number;
    gameStatus: keyof typeof GameStatus.GameStatus;

    //Game deck related
    protected deck: PokerDeck;
    protected jokerNumber: keyof typeof this.deck.numbers|undefined;
    protected validationCards: Card[];


    /// Methods ///     


    /**
     * Creates a Game.
     * Don't override this in variants as it may mess with initialization flow; instead, override individual functions as required.                    
     */
    constructor(playerIds: string[], options: GameOptions|undefined=undefined, gameId: string=''){
        this.gameId = gameId;

        this.config = this.loadConfig();
        this.logger = new Logger(this);

        this.players = this.initializePlayers(playerIds);
        this.quitPlayers = [];

        this.initialOptions = options;

        [this.useWildcard,
        this.useJoker,
        this.cardsToDraw,
        this.cardsToDrawDiscardPile,
        this.cardsToDeal,
        this.numberOfDecks] = this.initializeOptions(options ? options : {} as GameOptions);

        this.score = this.initializeScore();
        this.currentPlayerIndex = 0;
        this.currentRound = 0;
        this.gameStatus = this.GameStatus.ROUND_ENDED;

        [this.deck, this.jokerNumber, this.validationCards] = this.initializeDeckJokerAndValidationCards();
    }



    ////////////////////////////////////////////////////////////////////////////
    ////////////////////////////// Getters/setters /////////////////////////////
    ////////////////////////////////////////////////////////////////////////////



    ////////////////////////////////////////////////////////////////////////////
    ///////////////////////// Initialization functions /////////////////////////
    ////////////////////////////////////////////////////////////////////////////


    
    /**
     * Loads a json config file for the game (must be located in same directory, and named same as the class 'title' property)
     */
    loadConfig(){
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        return loadConfigFile(__dirname, this.title);
    }


    /** Initializes options that determine some customizable game-specific stuff. */
    initializeOptions(options: GameOptions|undefined): (keyof typeof GameOptions)[]{
        let useWildcard = setWildcardOption(this.config, options.useWildcard);
        let useJoker = setJokerOption(this.config, options.useJoker);
        let cardsToDraw = setCardsToDraw(this.config, options.cardsToDraw);
        let cardsToDrawDiscardPile = setCardsToDrawDiscardPile(this.config, options.cardsToDrawDiscardPile);
        let [cardsToDeal, numberOfDecks] = setCardsToDealAndNumberOfDecks(this.config, this.players.length, options.cardsToDeal, options.numberOfDecks);
        if (this.useJoker && this.useWildcard) this.useWildcard = false;

        return [
            useWildcard,
            useJoker,
            cardsToDraw,
            cardsToDrawDiscardPile,
            cardsToDeal,
            numberOfDecks
        ]
    }


    /**
     * Initializes an array of player objects
     * @param {int[]} playerIds
     * @returns {Player[]}
     */
    initializePlayers(playerIds){
        let players = [];
        for (const playerId of playerIds){
            players.push(new Player(this, playerId));
        }
        return players;
    }


    /** Initializes a Score object, which is used for tracking/calculating score for each round. */
    initializeScore(){
        return new GameScore(this);
    }


    /**
     * Initializes deck, joker (printed or wildcard, depending on game configuration), and a copy of the deck for validation later.
     * @returns {[int, int, Card[]]} 
     */
    initializeDeckJokerAndValidationCards(){
        let deck = new PokerDeck(this.numberOfDecks, this.useJoker);
        let validationCards = deck._stack.slice().sort(Card.compareCardsSuitFirst);
        deck.shuffle();
        
        //set joker either to printed joker ('Joker') or wildcard, or nothing.
        //wildcard number is (currentRound+1)%(size of deck numbers)
        let jokerNumber;
        if (this.useJoker) jokerNumber = 'Joker';
        else if (this.useWildcard) jokerNumber = this.getWildcardNumber(deck);
        else jokerNumber = undefined;

        return [deck, jokerNumber, validationCards];
    }


    /**
     * Get the current wildcard number if wildcards are enabled, upon start of each round.
     * Variants may handle wildcards differently, so overriding this method may be useful.
     * Currently, wildcard starts at 2 and increments on each round.
     * @modifies {jokerNumber}
     * @returns {string | boolean}
     */
    getWildcardNumber(deck){
        if (this.useWildcard){
            return deck.numbers[this.currentRound+1 % Object.keys(deck.numbers).length];
        }
        else return false;
    }



    ////////////////////////////////////////////////////////////////////////////
    ///////////////////////// Validation functions /////////////////////////
    ////////////////////////////////////////////////////////////////////////////



    /**
     * Validates that the cards in play tally with validationCards, and all melds are valid.
     * @modifies {gameStatus} - sets to END_GAME if game state is invalid
     * @modifies {logger} - Logs ending of game if game state is invalid
     * @returns {boolean} - Whether game state is valid
     */
    validateGameState(){
        if (!this.checkGameEnded() || !this.checkRoundEnded()) return false;

        //get deck and discard pile cards
        let checkCards = [];
        checkCards.push(...this.deck.getCards());
        checkCards.push(...this.deck.getDiscardPile());

        //for each player, add their hand cards to checkCards; then validate each meld, then add the cards to checkCards
        for (const player of this.players){
            checkCards.push(...player.hand);
            for (const meld of player.melds){
                if (meld.cards && meld.checkAndSortMeld()) checkCards.push(...meld.cards);
                else { 
                    this.logger.logWarning('validateGameState', undefined, undefined, `Player ${player.id} has invalid meld: ${meld.cards}`);
                    this.setGameStatus(this.GameStatus.END_GAME);
                    return false;
                }
            }
        }

        //sort checkCards and compare with validationCards (as strings, since they don't reference the same card objects)
        checkCards.sort(Card.compareCardsSuitFirst);    
        if (JSON.stringify(checkCards) != JSON.stringify(this.validationCards)){
            this.logger.logWarning('validateGameState', undefined, undefined, 'Invalid game state'); 
            this.setGameStatus(this.GameStatus.END_GAME);
            return false;
        }
        return true;
    }

    //Simply checks that the current gameStatus is correct
    validateGameStatus(intendedGameStatus){
        if (intendedGameStatus !== this.gameStatus) return false;
        return true;
    }


    /**
     * Checks if the round has ended.
     * Normally only occurs when the current (playing) player runs out their hand, but variants may have different conditions.
     * @modifies {gameStatus}
     * @modifies {logger} 
     * @returns {boolean}
     */
    checkRoundEnded(){
        if (this.players[this.currentPlayerIndex].hand==[] && this.players[this.currentPlayerIndex].playing){
            this.setGameStatus(this.GameStatus.ROUND_ENDED);
            this.logger.logGameAction(
                'checkRoundEnded', 
                undefined, 
                undefined, 
                `Current player ${this.players[this.currentPlayerIndex].hand.id} has finished hand. Ending round`
                )
            return false;
        }
        return true;
    }
    
    
    /**
     * Checks if the game has ended.
     * Normally only occurs if <=1 player is left playing, but variants may have different conditions.
     * @modifies {gameStatus}
     * @modifies {logger}
     * @returns {boolean}
     */
    //TO DO: OR the wildcard has run through entire deck? OR hit some limit on number of rounds? we'll see
    checkGameEnded(){
        let still_playing=0;
        for (const player of this.players){
            if (player.playing) still_playing++;
        }

        if (still_playing<=1){
            this.logger.logGameAction('checkGameEnded', undefined, undefined, '<=1 player left, ending game');
            this.setGameStatus(this.GameStatus.END_GAME);
            return false;
        }
        return true;
    }



    ////////////////////////////////////////////////////////////////////////////
    ///////////////////////// Game action functions ////////////////////////////
    ////////////////////////////////////////////////////////////////////////////
    


    /**
     * Verifies that the input is a GameStatus, and sets it
     * @modifies {gameStatus} - Sets to the input gameStatus
     * @param {GameStatus} gameStatus 
     * @returns {boolean}
     */
    setGameStatus(gameStatus){
        if (!Object.keys(this.GameStatus).find(status => status = gameStatus)) return false;
        this.gameStatus = gameStatus;
        return true;
    }


    
    /** 
     * Does some things (explained below) to start the next round.
     * @modifies {currentRound}
     * @modifies {score}
     * @modifies {players, quitPlayers}
     * @modifies {useWildcard, useJoker, cardsToDraw, cardsToDrawDiscardPile, cardsToDeal, numberOfDecks}
     * @modifies {gameStatus}
     * @modifies {logger}
     * @returns {boolean}
     */
    nextRound(){
        if (!this.validateGameState() || !this.validateGameStatus(this.GameStatus.ROUND_ENDED)) return false;

        //calculate the round score
        if (this.currentRound!=0) this.score.evaluateRoundScore();

        //increment round
        this.currentRound++;

        //moves just-quit players to quitPlayers, and just-unquit players to players
        for (const [index, player] of this.players.entries()){
            if (!player.playing) this.quitPlayers.push(...this.players.splice(index, 1));
        }
        for (const [index, player] of this.quitPlayers.entries()){
            if (player.playing) this.players.push(...this.quitPlayers.splice(index, 1));
        }

        //create next round in score object
        this.score.initializeRound();
        
        //set game config again (particularly cardsToDeal, if number of players changed)
        this.initializeOptions(this.initialOptions);

        //reset deck and get the next jokerNumber
        [this.deck, this.jokerNumber, this.validationCards] = this.initializeDeckJokerAndValidationCards();
        
        //deal cards
        for (const player of this.players){
            player.resetCards();
            player.addToHand(this.deck.draw(this.cardsToDeal));
        }

        //if it's the first round, deal extra card to first player + let them start
        if (this.currentRound===1){
            this.players[0].addToHand(this.deck.draw(1));
            this.setGameStatus(this.GameStatus.PLAYER_TURN);
        }   

        //else, find the previous winner and deal them extra card + let them start
        else{
            //TO DO: get last round winner
            this.setGameStatus(this.GameStatus.PLAYER_TO_DRAW);
        }

        this.logger.logNewRound();
        return true;
    }


    /**
     * Goes to the next player.
     * While the next player isn't playing, go to the next next player.
     * @modifies {currentPlayerIndex}
     * @modifies {gameStatus}
     * @modifies {gameStatus}
     * @returns {boolean}
     */
    nextPlayer(){
        if (!this.validateGameState() || !this.validateGameStatus(this.GameStatus.PLAYER_TURN_ENDED)) return false;

        //while next player isn't playing, go to the next next player (modulo no. of players, to loop back to first player)
        do {this.currentPlayerIndex = (this.currentPlayerIndex+1) % (this.players.length);}
        while (!this.players[(this.currentPlayerIndex+1) % (this.players.length)].playing)

        this.setGameStatus(this.GameStatus.PLAYER_TO_DRAW);
        return true;
    }


    /**
     * Sets a player as having quit; keeps their cards in their possession for current round.
     * @modifies {logger}
     * @param {int} playerIndex - Index of the player who is quitting (default is current player)
     * @returns {boolean}
     */
    quitPlayer(playerIndex=this.currentPlayerIndex){
        if (!this.validateGameState()) return false;

        if (playerIndex > this.players.length) return false;

        this.players[playerIndex].playing = false;
        if (this.checkGameEnded()) return true;
        if (this.currentPlayerIndex === playerIndex){
            this.setGameStatus(this.GameStatus.PLAYER_TURN_ENDED);
            this.nextPlayer();
        }
        this.logger.logGameAction('quitPlayer', this.players[playerIndex].id, {playerIndex}, undefined);
        return true;
    }


    /**
     * Unquits a player who was playing; they will continue next round with their previous round scores intact.
     * @modifies {logger}
     * @param {integer} playerId - ID of the player to unquit
     * @returns {boolean}
     */
    unquitPlayer(playerId){
        if (!this.validateGameState()) return false;

        for (const [index, player] of this.quitPlayers.entries()){
            if (player.id == playerId){
                unquitter = this.quitPlayers.splice(index, 1);
                this.players.push(...unquitter);
                this.logger.logGameAction('unquitPlayer', playerId, {playerId}, undefined);
                return true;
            }
        }
        return false;
    }


    
    /**
     * Adds a new player to the game.
     * @modifies {logger}
     * @param {integer} playerId - ID of the new player
     * @returns {boolean}
     */
    addPlayer(playerId){
        if (!this.validateGameState()) return;
        this.players.push(new Player(this, playerId));
        this.logger.logGameAction('addPlayer', playerId, {playerId}, undefined); 
    }


    //Forces ending the game
    //TO DO
    forceEndGame(){

    }



    ////////////////////////////////////////////////////////////////////////////
    ///////////// Player action functions (acts on current player) /////////////
    ////////////////////////////////////////////////////////////////////////////

    
    
    /**
     * Sorts a player's hand, by suit THEN by number
     * @modifies {players[playerIndex]}
     * @modifies {logger}
     * @param {int} playerIndex - Default is current player
     * @returns {boolean}
     */
    //TO DO: this is broken (probably the comparison function), plz fix
    sortHandBySuit(playerIndex = this.currentPlayerIndex){
        if (!this.validateGameState()) return false;

        this.players[playerIndex].hand.sort((a, b) => {
            if (a.number == this.jokerNumber && b.number == this.jokerNumber) return Card.compareCardsSuitFirst(a, b);
            if (a.number == this.jokerNumber) return 1;
            if (b.number == this.jokerNumber) return -1;
            return Card.compareCardsSuitFirst(a, b);
        })

        this.logger.logGameAction('sortHandBySuit', this.players[playerIndex].id, undefined, undefined);
        return true;
    }


    /**
     * Sorts a player's hand, by number THEN by suit (most commonly used sort)
     * @modifies {players[playerIndex]}
     * @modifies {logger}
     * @param {*} playerIndex - Default is current player
     * @returns {boolean}
     */
    sortHandByNumber(playerIndex = this.currentPlayerIndex){
        if (!this.validateGameState()) return false;

        this.players[playerIndex].hand.sort((a, b) => {
            if (a.number == this.jokerNumber && b.number == this.jokerNumber) return Card.compareCardsNumberFirst(a, b);
            if (a.number == this.jokerNumber) return 1;
            if (b.number == this.jokerNumber) return -1;
            return Card.compareCardsNumberFirst(a, b);
        })

        this.logger.logGameAction('sortHandByNumber', this.players[playerIndex].id, undefined, undefined);
        return true;
    }


    
    /**
     * Draws 'cardsToDraw' cards from the deck, for the current player.
     * @modifies {deck}
     * @modifies {gameStatus}
     * @modifies {players[currentPlayerIndex]}
     * @modifies {logger}
     * @returns {boolean}
     */
    drawFromDeck(){
        if (!this.validateGameState() || !this.validateGameStatus(this.GameStatus.PLAYER_TO_DRAW)) return false;

        let drawnCards = this.deck.draw(this.cardsToDraw);
        this.players[this.currentPlayerIndex].hand.push(...drawnCards);

        this.logger.logGameAction('drawFromDeck', this.players[this.currentPlayerIndex].id, undefined, `Card drawn: ${drawnCards}`); 
        this.setGameStatus(this.GameStatus.PLAYER_TURN);
        return true;
    }


    /**
     * Draws 'cardsToDrawDiscardPile' cards from the discard pile, for the current player.
     * If insufficient cards in discard pile, returns false.
     * @modifies {deck}
     * @modifies {gameStatus}
     * @modifies {players[currentPlayerIndex]}
     * @modifies {logger}
     * @returns {boolean}
     */
    drawFromDiscardPile(){
        if (!this.validateGameState() || !this.validateGameStatus(this.GameStatus.PLAYER_TO_DRAW)) return false;

        if (this.deck.getDiscardPileSize() < this.cardsToDrawDiscardPile) return false;

        let drawnCards = this.deck.drawFromDiscardPile(this.cardsToDrawDiscardPile);
        this.players[this.currentPlayerIndex].hand.push(...drawnCards);

        this.logger.logGameAction('drawFromDiscardPile', this.players[this.currentPlayerIndex].id, undefined, `Card drawn: ${drawnCards}`);
        this.setGameStatus(this.GameStatus.PLAYER_TURN);
        return true;
    }


    /**
     * Attempts to create a meld out of chosen cards in the current player's hand.
     * @modifies {players[currentPlayerIndex]}
     * @modifies {logger}
     * @param {int[]} indexArray - Array of integers representing indexes of chosen cards in the hand
     * @returns {boolean}
     */
    createMeld(indexArray){
        if (!this.validateGameState() || !this.validateGameStatus(this.GameStatus.PLAYER_TURN)) return false;

        //create set so indexes are all unique
        let indexSet = new Set(indexArray);

        //get copy of player's hand, to copy back if meld is invalid
        let playerHandCopy = this.players[this.currentPlayerIndex].hand.slice();

        //check if each index is valid, then add the corresponding card to meldCards
        let meldCards = [];
        for (const index of indexSet){
            if (isNaN(index) || index>this.players[this.currentPlayerIndex].hand.length){
                this.logger.logWarning('createMeld', this.players[this.currentPlayerIndex].id, {indexArray}, 'Invalid index array');
                this.players[this.currentPlayerIndex].hand = playerHandCopy;
                return false;
            }
            meldCards.push(...this.players[this.currentPlayerIndex].hand.slice(index, index+1)); 
        }
        
        //then search and remove the cards from the hand 
        //if this is done while getting cards, card indexes in indexArray become invalid due to changing hand size
        for (const meldCard of meldCards){
            this.players[this.currentPlayerIndex].hand = this.players[this.currentPlayerIndex].hand.filter(card =>{
                return !(card.suit==meldCard.suit && card.number==meldCard.number);
            })
        }

        //if meld is valid, create the Meld object and add it to player's melds; else, reset the player's hand
        if (validateAndSortMeld(meldCards, this.jokerNumber)){
            let newMeld = new Meld(meldCards, this.jokerNumber);
            this.players[this.currentPlayerIndex].addMeld(newMeld);
            this.logger.logGameAction('createMeld', this.players[this.currentPlayerIndex].id, {indexArray});
            return true;
        }
    
        else{
            this.invalidMeldDeclaration();
            this.logger.logWarning('createMeld', this.players[this.currentPlayerIndex].id, {indexArray}, 'Invalid meld');
            this.invalidMeldDeclaration();
            this.players[this.currentPlayerIndex].hand = playerHandCopy;
            return false;
        }
    }


    /**
     * Creates a forfeit for the current player if they declared an invalid meld. (Some Rummy variants have such a rule)
     * Called automatically by createMeld in the case of invalid meld.
     * Doesn't do anything ATM but can be overridden if needed
     */
    invalidMeldDeclaration(){
        return;
    }


    /**
     * Attempts to add a specified card in current player's hand, to a specified meld, of a specified player.
     * @modifies {players[currentPlayerIndex]}
     * @modifies {player[meldOwnerIndex]}
     * @modifies {logger}
     * @param {int} addingCardIndex 
     * @param {int} meldOwnerIndex 
     * @param {int} meldIndex 
     * @returns {boolean}
     */
    addToMeld(addingCardIndex, meldOwnerIndex, meldIndex){
        if (!this.validateGameState() || !this.validateGameStatus(this.GameStatus.PLAYER_TURN)) return;

        if (addingCardIndex >= this.players[this.currentPlayerIndex].hand.length ||
            meldOwnerIndex >= this.players.length ||
            meldIndex >= this.players[meldOwnerIndex]) 
            return false;

        let potentialMeld = this.players[meldOwnerIndex].melds[meldIndex];
        let addingCard = this.players[this.currentPlayerIndex].hand[addingCardIndex];

        if (potentialMeld.addCard(addingCard, this.jokerNumber)){
            this.players[meldOwnerIndex].melds[meldIndex] = potentialMeld;
            this.players[this.currentPlayerIndex].hand.splice(addingCardIndex, 1);

            this.logger.logGameAction('addToMeld', this.players[this.currentPlayerIndex].id, {addingCardIndex, meldOwnerIndex, meldIndex});
            return true;
        }

        else{
            this.logger.logWarning(
                'addToMeld',
                this.players[this.currentPlayerIndex].id,
                {addingCardIndex, meldOwnerIndex, meldIndex},
                'Invalid meld addition'
                );
            return false;
        }
    }


    /**
     * Attempts to replace a specified card (only jokers?) in a specified meld, with a specified card in current player's hand.
     * @modifies {players[currentPlayerIndex]}
     * @modifies {players[meldOwnerIndex]}
     * @modifies {logger}
     * @param {int} replacingCardIndex 
     * @param {int} meldOwnerIndex 
     * @param {int} meldIndex 
     * @param {int} replacedCardIndex 
     * @returns {boolean}
     */
    replaceMeldCard(replacingCardIndex, meldOwnerIndex, meldIndex, replacedCardIndex){
        if (!this.validateGameState() || !this.validateGameStatus(this.GameStatus.PLAYER_TURN)) return;

        if (replacingCardIndex >= this.players[this.currentPlayerIndex].hand.length ||
            meldOwnerIndex >= this.players.length ||
            meldIndex >= this.players[meldOwnerIndex].melds.length ||
            replacedCardIndex >= this.players[meldOwnerIndex].melds[meldIndex].cards.length) 
            return false;

        let potentialMeld = this.players[meldOwnerIndex].melds[meldIndex];
        let replacingCard = this.players[this.currentPlayerIndex].hand[replacingCardIndex];
        let replacedCard = potentialMeld.replaceCard(replacingCard, replacedCardIndex, this.jokerNumber);

        if (replacedCard){
            this.players[meldOwnerIndex].melds[meldIndex] = potentialMeld;
            this.players[this.currentPlayerIndex].hand.splice(replacingCardIndex, 1);
            this.players[this.currentPlayerIndex].addToHand(replacedCard);

            this.logger.logGameAction(
                'replaceMeldCard',
                this.players[this.currentPlayerIndex].id,
                {replacingCardIndex, meldOwnerIndex, meldIndex, replacedCardIndex}
                );
            return true;
        }

        else{
            this.logger.logWarning(
                'replaceMeldCard',
                this.players[this.currentPlayerIndex].id,
                {replacingCardIndex, meldOwnerIndex, meldIndex, replacedCardIndex},
                'Invalid card replacement'
            );
            return false;
        }
    }

    
    /**
     * End current player's turn, and choose a card in hand to discard.
     * @modifies {gameStatus}
     * @modifies {players[currentPlayerIndex]}
     * @modifies {logger}
     * @param {int} cardIndex 
     * @returns {boolean}
     */
    endTurn(cardIndex){
        if (!this.validateGameState() || !this.validateGameStatus(this.GameStatus.PLAYER_TURN)) return false;

        if (cardIndex >= this.players[this.currentPlayerIndex].hand.length || isNaN(cardIndex)){
            this.logger.logWarning('endTurn', this.players[this.currentPlayerIndex].id, {cardIndex}, undefined);
            return false;
        }

        let discardedCard = this.players[this.currentPlayerIndex].hand.splice(cardIndex, 1);
        this.deck.addToDiscardPile(discardedCard);
        this.logger.logGameAction('endTurn', this.players[this.currentPlayerIndex].id, {cardIndex}, undefined);
        this.setGameStatus(this.GameStatus.PLAYER_TURN_ENDED);
        return true;
    }



    ////////////////////////////////////////////////////////////////////////////
    ///////////////////////////// Viewing functions ////////////////////////////
    ////////////////////////////////////////////////////////////////////////////



    /**
     * Returns an object with information useful for a player (defaults to current player)
     * @param {playerIndex}
     * @returns 
     */
    getGameInfoForPlayer(playerIndex = this.currentPlayerIndex){
        let gameInfo = {};

        gameInfo.jokerNumber = this.jokerNumber;
        gameInfo.deckSize = this.deck.remaining();
        gameInfo.topDiscardCard = this.deck.getTopOfDiscardPile();
        gameInfo.discardPileSize = this.deck.getDiscardPileSize();

        let player = {};
        player.id = this.players[playerIndex].id;
        player.hand = this.players[playerIndex].hand;
        player.melds = this.players[playerIndex].melds;

        let tableMelds = {};
        for (const player of this.players){
            tableMelds[player.id] = player.melds;
        }

        gameInfo.currentPlayer = player;
        gameInfo.tableMelds = tableMelds;
        return gameInfo;
    }
}