package dev.pumpwatch.connectors.core;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** Test double for the seen_items table. */
public class FakeSeenItems extends SeenItems {
    public final Set<String> marked = ConcurrentHashMap.newKeySet();

    public FakeSeenItems() {
        super(null);
    }

    @Override
    public boolean isSeen(String source, String itemId) {
        return marked.contains(source + ":" + itemId);
    }

    @Override
    public boolean markNew(String source, String itemId) {
        return marked.add(source + ":" + itemId);
    }
}
