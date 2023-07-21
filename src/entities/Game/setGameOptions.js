/*
Functions here are used for setting/verifying config options.
Most work like so:
    -Accepts a config object and the intended option
    -If option wasn't specified, set it to the config default
    -If the config doesn't specify any value/a useable value for that option, set it to a hardcoded value
    -Return the option

Some functions, eg setCardsToDrawAndNumberOfDecks, may have additional logic to ensure the specified options are feasible etc.
*/


//Returns useWildcard option.
export function setWildcardOption(config, useJoker){
    let setUseJoker;
    if (useJoker===undefined){
        if (config.useJoker!==false || config.useJoker!==true) setUseJoker = true;
        else setUseJoker = config.useJoker;
    }
    else setUseJoker = useJoker;
    return setUseJoker;
}

//Returns useJoker option.
export function setJokerOption(config, useWildcard){
    let setUseWildcard;
    if (useWildcard===undefined){
        if (config.useWildcard!==false || config.useWildcard!==true) setUseWildcard = true;
        else setUseWildcard = config.useWildcard;
    }
    else setUseWildcard = useWildcard;
    return setUseWildcard;
}

//Returns cardsToDrawDiscardPile option.
export function setCardsToDrawDiscardPile(config, cardsToDrawDiscardPile){
    let setCardsToDrawDiscardPile;
    if (cardsToDrawDiscardPile===undefined){
        if (!config.cardsToDrawDiscardPile) setCardsToDrawDiscardPile = 1;
        else setCardsToDrawDiscardPile = config.useWildcard;
    }
    else setCardsToDrawDiscardPile = cardsToDrawDiscardPile;
    return setCardsToDrawDiscardPile;
}


/*
Returns cardsToDraw and numberOfDecks options.
Checks to see if total cards drawn exceeds the total deck size; if so, overrides the specified options.
Checks other numberOfDecks, if given one doesn't specify a cardsToDraw in the config.
*/
export function setCardsToDrawAndNumberOfDecks(config, playersSize, cardsToDraw, numberOfDecks){
    let setCardsToDraw, setNumberOfDecks;

    //if specified values are valid, return them
    if (cardsToDraw!==0 && playersSize*cardsToDraw < numberOfDecks*52){
        return [cardsToDraw, numberOfDecks];
    }

    //if cardsToDraw not specified, or no cardsToDraw found for the given numberOfDecks/given numberOfDecks and playersSize,
    //then loop through other numberOfDecks to find existing cardsToDraw for the given playersSize, and use that.                                                                  
    let cardsToDrawRules = config.cardsToDraw.decks;
    if (numberOfDecks===undefined || !cardsToDrawRules[numberOfDecks] || !cardsToDrawRules[numberOfDecks].players[playersSize]){
        for (const deckNo in cardsToDrawRules){
            let cardsToDraw = cardsToDrawRules[deckNo].players[playersSize];
            if (cardsToDraw){
                setCardsToDraw = cardsToDraw;
                setNumberOfDecks = deckNo;
                break;
            }
        }

        //if no cardsToDraw found at all for playersSize, throw error
        if (!setCardsToDraw || !setNumberOfDecks){
            throw new Error('No amount of cards can be dealt for the amount of players given.');
        }
    }

    //if cardsToDraw exists for given numberOfDecks and playersSize, return it
    else{
        setCardsToDraw = cardsToDrawRules[numberOfDecks].players[playersSize];
        setNumberOfDecks = numberOfDecks;
    }
    return [setCardsToDraw, setNumberOfDecks];
}

