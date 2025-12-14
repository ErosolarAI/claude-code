#!/bin/bash
# Monitor journalist social media for diplomatic leaks

JOURNALISTS=(
    "@michaeldscher"    # Michael D. Shear - NYT
    "@stevenlerlanger"  # Steven Erlanger - NYT  
    "@DavidSanger"      # David Sanger - NYT
    "@missy_ryan"       # Missy Ryan - WaPo
    "@maxseddon"        # Max Seddon - FT
)

echo "=== Journalist Social Media Monitor ==="
echo "Tracking journalists covering Ukraine negotiations"
echo ""

for journalist in "${JOURNALISTS[@]}"; do
    echo "Target: $journalist"
    echo "  Platform: Twitter/X"
    echo "  Coverage: Ukraine, Russia, diplomatic talks"
    echo "  Risk level: HIGH - potential for leaks"
    echo ""
done

echo "Monitoring strategies:"
echo "1. Track hashtags: #UkrainePeaceTalks #BerlinTalks"
echo "2. Monitor mentions of key officials"
echo "3. Watch for document/image uploads"
echo "4. Alert on location tags near negotiation sites"
