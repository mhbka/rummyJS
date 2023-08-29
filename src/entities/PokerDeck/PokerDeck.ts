import { suits, numbers } from './suitsNumbers.js';
import { Card } from './Card.js';
import { Deck } from './Deck.js';



/**
 * Represents a poker deck.
 * Automatically populates the deck with poker cards, and has additional discardPile property of type Deck.
 */
export class PokerDeck extends Deck{
    /// Properties /// 


    /** Access suits enum through the class. */
    suits = suits;

    /** Access suits enum through the class. */
    numbers = numbers;

    /** The deck's discard pile. */
    private _discardPile: Deck;


    /// Methods ///
    

    /**
     * Creates a PokerDeck by iterating over all possible suits and numbers.
     * @constructor
     * @param numberOfDecks - Number of full poker decks to populate the deck with
     * @param useJoker - Whether to add 'numberOfDecks' * printed jokers to the deck
     */
    constructor(numberOfDecks=1, useJoker=false) {
        const cards: Card[] = [];

        //skip Joker index if useJoker is false
        let x = useJoker ? 0 : 1;
        let y = useJoker ? 0 : 1;

        //get keys for suits and numbers
        let suitsKeys: (keyof typeof suits)[] = Object.keys(suits) as (keyof typeof suits)[];
        let numbersKeys: (keyof typeof numbers)[] = Object.keys(numbers) as (keyof typeof numbers)[];

        //iterate over all suits and numbers
        for (; x<suitsKeys.length; x++) {
            for (; y<numbersKeys.length; y++) {
                for (let i=0; i<numberOfDecks; i++){
                    cards.push(new Card(suitsKeys[x], numbersKeys[y]));
                }
            }
        }
        super(cards);
        this._discardPile = new Deck();
    }


    /** Draws cards from the deck. Automatically shuffles the discard pile back into deck, if the deck is too small. */
    draw(count: number){
        if (this.remaining()-count <= 0 ) this.resetDiscardPile();
        return super.draw(count);
    }


    /** Returns copy of the deck. */
    getDiscardPile(): Card[]{
        return [...this._discardPile.getCards()];
    }
   

    /** Returns the deck size. */
    getDiscardPileSize(): number{
        return this._discardPile.remaining();
    }


    //Returns top card of the discard pile.
    getTopOfDiscardPile(): Card{
        return this._discardPile.getCards()[this.getDiscardPileSize()-1];
    }


    /** Adds a card to the top of the discard pile. */
    addToDiscardPile(card: Card){
        this._discardPile.addToTop([card]);
    }


    /** Draws from the discard pile. */
    drawFromDiscardPile(count: number){
        return this._discardPile.draw(count);
    }


    /**  Puts the discard pile back onto the top of the deck. */
    resetDiscardPile(){
        let allDiscardedCards = this.drawFromDiscardPile(this._discardPile.remaining());
        if (allDiscardedCards != false) this.addToTop(allDiscardedCards);
    }
}