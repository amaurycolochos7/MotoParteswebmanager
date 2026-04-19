import prisma, { workspaceContext } from './prisma.js';

// Tiny event bus that hydrates AutomationJob rows for a given trigger.
//
// Call from route handlers with: await fireEvent('order.created', { workspaceId, orderId })
//
// `fireEvent` is intentionally fire-and-forget from the caller's perspective:
// it never throws to the request handler; it logs and swallows so a broken
// automation never blocks a business operation.

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

// Does the context match the automation's filter? Filters are a flat map of
// { key: value } which must all equal the corresponding key in context.
function matchesFilter(filter, context) {
    if (!filter || typeof filter !== 'object') return true;
    for (const [key, value] of Object.entries(filter)) {
        if (context[key] !== value) return false;
    }
    return true;
}

export async function fireEvent(trigger, contextFromCaller) {
    try {
        const { workspaceId, ...context } = contextFromCaller || {};
        if (!workspaceId) {
            console.warn(`[events] ${trigger} fired without workspaceId — skipping`);
            return { queued: 0 };
        }

        const automations = await unscoped(() =>
            prisma.automation.findMany({
                where: { workspace_id: workspaceId, trigger, enabled: true },
            })
        );
        if (!automations.length) return { queued: 0 };

        const now = Date.now();
        let queued = 0;
        for (const auto of automations) {
            if (!matchesFilter(auto.filter || {}, context)) continue;
            const delayMs = (auto.delay_minutes || 0) * 60 * 1000;
            await unscoped(() =>
                prisma.automationJob.create({
                    data: {
                        workspace_id: workspaceId,
                        automation_id: auto.id,
                        trigger_event: trigger,
                        context,
                        scheduled_at: new Date(now + delayMs),
                    },
                })
            );
            queued += 1;
        }
        return { queued };
    } catch (err) {
        console.error(`[events] fireEvent(${trigger}) failed:`, err.message);
        return { queued: 0, error: err.message };
    }
}
