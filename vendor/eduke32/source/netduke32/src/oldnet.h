#ifndef OLDNET_H
#define OLDNET_H

#include "build.h"
#include "player.h"
#include "sync.h"

#ifdef OLDNET_CPP_
#define OLDNET_EXTERN
#else
#define OLDNET_EXTERN extern
#endif

#define NOT_PREDICTABLE -1

#define INPUTFIFO_CURTICK (movefifoplc & (MOVEFIFOSIZ - 1))
#define INPUTFIFO_LASTTICK ((movefifoplc - 1) & (MOVEFIFOSIZ - 1))
#define INPUTFIFO_PREDICTTICK (predictfifoplc & (MOVEFIFOSIZ - 1))

#define CREATE_PREDICTED_LINKED_LIST(name) decltype(head##name) predicted_head##name; \
                                           decltype(prev##name) predicted_prev##name; \
                                           decltype(next##name) predicted_next##name

#define swap_predicted_linked_list(name) std::swap(head##name, predicted_head##name), \
                                         std::swap(prev##name, predicted_prev##name), \
                                         std::swap(next##name, predicted_next##name)

#define reset_predicted_linked_list(name) memcpy(predicted_head##name, head##name, sizeof(predicted_head##name)), \
                                          memcpy(predicted_prev##name, prev##name, sizeof(predicted_prev##name)), \
                                          memcpy(predicted_next##name, next##name, sizeof(predicted_next##name))

#if 0 // Do not remove this code. I need to use this in the future.
typedef struct
{
    //vec3_t pos;
    //fix16_t q16horiz, q16ang;
    char playerHash;
} PredictBackup_t;
#endif

struct votedata_t
{
    int32_t dmflags;
    int8_t starter = -1, level = -1, episode = -1;
    int8_t yes_votes;
    int8_t gametype, skill;
};
OLDNET_EXTERN votedata_t vote;

extern int quittimer;
extern int lastpackettime;
extern int mymaxlag, otherminlag, bufferjitter;

extern int movefifosendplc;
extern int movefifoplc;

OLDNET_EXTERN input_t netInput;

OLDNET_EXTERN bool oldnet_gotinitialsettings; // True if we got PACKET_TYPE_INIT_SETTINGS from the host.
OLDNET_EXTERN int32_t oldnet_predictcontext; // Must set to player number on code branches that are able to predict sounds and other effects.
OLDNET_EXTERN int32_t oldnet_predicting; // Check if oldnet_predicting is non-zero and return in code branches you want to avoid going into during prediction.

OLDNET_EXTERN int predictfifoplc;

OLDNET_EXTERN DukePlayer_t* originalPlayer;
OLDNET_EXTERN DukePlayer_t predictedPlayer;

OLDNET_EXTERN spritetype predicted_sprite[MAXSPRITES];
OLDNET_EXTERN spritetype* original_sprite;

OLDNET_EXTERN ActorData_t predicted_pActor;

OLDNET_EXTERN intptr_t* original_pValues[MAXGAMEVARS];
OLDNET_EXTERN intptr_t* predicted_pValues[MAXGAMEVARS];
OLDNET_EXTERN intptr_t predicted_lValue[MAXGAMEVARS];

//OLDNET_EXTERN PredictBackup_t predictBackup[MOVEFIFOSIZ];

enum DukePacket_t
{
    PACKET_TYPE_MASTER_TO_SLAVE,
    PACKET_TYPE_SLAVE_TO_MASTER,
    PACKET_TYPE_BROADCAST,
    SERVER_GENERATED_BROADCAST,
    PACKET_TYPE_VERSION,

    /* don't change anything above this line */

    PACKET_TYPE_MESSAGE,

    PACKET_TYPE_NEW_GAME,
    PACKET_TYPE_RTS,
    PACKET_TYPE_MENU_LEVEL_QUIT,
    PACKET_TYPE_WEAPON_CHOICE,
    PACKET_TYPE_PLAYER_OPTIONS,
    PACKET_TYPE_PLAYER_NAME,
    PACKET_TYPE_INIT_SETTINGS,

    PACKET_TYPE_USER_MAP,

    PACKET_TYPE_MAP_VOTE,
    PACKET_TYPE_MAP_VOTE_INITIATE,
    PACKET_TYPE_MAP_VOTE_CANCEL,

    PACKET_TYPE_LOAD_GAME,
    PACKET_TYPE_NULL_PACKET,
    PACKET_TYPE_PLAYER_READY,
    PACKET_TYPE_FRAGLIMIT_CHANGED,
    PACKET_TYPE_EOL,
    PACKET_TYPE_PING,
    PACKET_END, // Should remain last in list.
};

enum
{
    PREDICTSTATE_OFF = 0,
    PREDICTSTATE_PROCESS = 1,
    PREDICTSTATE_CORRECT = 2,
};

enum NetMode_t
{
    NETMODE_MASTERSLAVE,
    NETMODE_P2P, // UNSUPPORTED.
    NETMODE_OFFLINE = 255
};

void faketimerhandler(void);
void Net_HandleInput(void);
void Net_GetPackets(void);
void Net_ParsePackets(void);
void Net_SendQuit(void);
void Net_SendWeaponChoice(void);
void Net_SendVersion(void);
void Net_SendPlayerOptions(void);
void Net_SendFragLimit(void);
void Net_SendPlayerName(void);
void Net_SendUserMapName(void);
void Net_SendInitialSettings(void);
void Net_SendNewGame(uint32_t flags);
void Net_EndOfLevel(bool secret);
void Net_EnterMessage(void);

void Net_InitializeStructPointers(void);
void Net_CorrectPrediction(void);
void Net_InitializePrediction(void);
void Net_SwapPredictedLinkedLists(void);
void Net_DoPrediction(int state);
void Net_UsePredictedPointers(void);
void Net_UseOriginalPointers(void);

void Net_InitiateVote();
void Net_CancelVote();

void Net_ClearFIFO(void);
void Net_CheckPlayerQuit(int i);
void Net_Disconnect(bool showScores);
void Net_WaitForPlayers();

// Returns true if we're in a valid predictable state and context for the local player.
// Used to prevent sounds and display events from triggering outside of prediction if they are predictable.
// Also prevents double-playing of one-shot events like light flashes and sound playback.
static inline bool Net_InPredictableState(int32_t spriteNum = -1)
{
    if (numplayers > 1)
    {
        auto const p = g_player[myconnectindex].ps;
        // Do not predict during correction phase, lest we annihilate our ears/eyes.
        if (oldnet_predicting == PREDICTSTATE_CORRECT)
            return false;

        // Predictable state, but we're not predicting, so block.
        if ((oldnet_predictcontext == myconnectindex) && (spriteNum == -1 || spriteNum == p->i) && (oldnet_predicting == PREDICTSTATE_OFF))
            return false;
    }

    return true;
}

// [JM] Taken from this tutorial: https://github.com/isocpp/CppCoreGuidelines/blob/master/CppCoreGuidelines.md#e19-use-a-final_action-object-to-express-cleanup-if-no-suitable-resource-handle-is-available
//      Uses a struct's destructor as a clever way of performing an action when a function returns or the current scope is left.
template<typename A>
struct final_action {   // slightly simplified
    A act;
    final_action(A a) : act{ a } {}
    ~final_action() { act(); }
};

template<typename A>
final_action<A> finally(A act)   // deduce action type
{
    return final_action<A>{act};
}

// Put at the highest point of predictable code branches.
#define SET_PREDICTION_CONTEXT(playerNum)   \
    oldnet_predictcontext = playerNum;      \
    auto onexit = finally([&]{ oldnet_predictcontext = NOT_PREDICTABLE; })

// Put at the start of functions that cannot be predicted.
// Returns immediately if predicting. Automatically handles reverting to old context value on any return.
// Set retval for the desired value when bailing during prediction.
#define UNPREDICTABLE_FUNCTION(retval)                                      \
    auto const pcontext_old = oldnet_predictcontext;                        \
    oldnet_predictcontext = NOT_PREDICTABLE;                                \
    auto onexit = finally([&]{ oldnet_predictcontext = pcontext_old; });    \
    if(oldnet_predicting) return retval

#endif
