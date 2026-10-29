package dev.pumpwatch.pipeline.scorer;

import dev.pumpwatch.common.Features;
import dev.pumpwatch.common.Flag;
import dev.pumpwatch.common.Score;
import java.util.List;

/** Features to Score. A trained model can replace the rules without touching the other stages. */
public interface Scorer {
    String modelVersion();

    Score score(Features features);

    /** Largest-first contributions behind {@link #score}, used as flag evidence. Occlusion works for any scorer. */
    default List<Flag.Contributor> contributors(Features features) {
        return Occlusion.explain(this, features);
    }
}
