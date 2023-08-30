import { Game } from "../entities/Game/Game";
import { getOptions } from "./auxiliary/getOptions";
import { playerTurn } from "./playerTurn";
import { playerDraw } from "./playerDraw";



async function main(){
    //get options and create game
    let [players, options] = await getOptions();
    let playerIds = Array.from(Array(players), (_, index) => `${index}`);
    let game = new Game(playerIds, options);

    console.log(`
    -----
    Game configuration: 
        Joker: ${game.jokerNumber}
        cardsToDraw:  ${game.cardsToDraw}
        cardsToDrawDiscardPile: ${game.cardsToDrawDiscardPile}
        cardsToDeal: ${game.cardsToDeal}
        numberOfDecks: ${game.numberOfDecks}
    -----
    `)
    
    game.nextRound();

    //main game loop
    while (game.gameStatus != game.GameStatus.END_GAME){
        while (game.gameStatus != game.GameStatus.ROUND_ENDED && game.gameStatus != game.GameStatus.END_GAME){
            if (game.gameStatus == game.GameStatus.PLAYER_TURN) await playerTurn(game);
            game.nextPlayer();
            if (game.gameStatus == game.GameStatus.PLAYER_TO_DRAW) await playerDraw(game);
        }
        console.log('Round has ended! Score: ');
        game.nextRound();
        }
    console.log('Game has ended. Thanks for playing!');
}


//execute
main();
  
  
  
  
  
  
  