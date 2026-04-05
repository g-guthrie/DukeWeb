#ifndef GAMEEXEC_H
#define GAMEEXEC_H

#include "build.h"
#include "gamedef.h"  // vmstate_t
#include "sector.h"  // mapstate_t

enum vmflags_t
{
    VM_RETURN       = 0x00000001,
    VM_KILL         = 0x00000002,
    VM_NOEXECUTE    = 0x00000004,
};

void VM_ScriptInfo(intptr_t const* const ptr, int const range);
void VM_UpdateAnim(int const spriteNum, int32_t* const pData);

void X_OnEvent(int iEventID, int sActor, int sPlayer, int lDist);
int X_OnEventWithReturn(int iEventID, int sActor, int sPlayer, int nReturn);

int A_GetFurthestAngle(int const spriteNum, int const angDiv);

void A_GetZLimits(int iActor);
void A_Fall(int iActor);

static FORCE_INLINE int VM_HaveEvent(int const nEventID)
{
    return !!apScriptEvents[nEventID];
}

#define CON_ERRPRINTF(Text, ...) do { \
    vm.flags |= VM_RETURN; \
    LOG_F(ERROR, "%s:%d: %s: " Text, VM_FILENAME(insptr), VM_DECODE_LINE_NUMBER(g_tw), VM_GetKeywordForID(VM_DECODE_INST(g_tw)), ## __VA_ARGS__); \
} while (0)

#define CON_CRITICALERRPRINTF(Text, ...) do { \
    vm.flags |= VM_RETURN; \
    LOG_F(ERROR, "%s:%d: %s: " Text, VM_FILENAME(insptr), VM_DECODE_LINE_NUMBER(g_tw), VM_GetKeywordForID(VM_DECODE_INST(g_tw)), ## __VA_ARGS__); \
    wm_msgbox(APPNAME, "%s:%d: %s: " Text, VM_FILENAME(insptr), VM_DECODE_LINE_NUMBER(g_tw), VM_GetKeywordForID(VM_DECODE_INST(g_tw)), ## __VA_ARGS__); \
} while (0)

#endif // GAMEEXEC_H