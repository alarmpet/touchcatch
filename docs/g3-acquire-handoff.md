# G3 acquire handoff

The current G3 acquire operation is a trusted, explicit single-writer handoff only. It is not evidence of a production multi-writer compare-and-swap boundary.

Before more than one adapter owner may acquire the same match, the production adapter must provide an atomic database CAS/fencing transition and a concurrent regression test proving exactly one owner. Until that artifact exists, callers must serialize acquire through the trusted adapter boundary and must not expose it as a public or independently concurrent operation.
