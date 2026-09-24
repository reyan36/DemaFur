from datetime import datetime, timedelta


def assess(events, windows, resolution, clock):
    """Policy scores are heuristic, never probabilities or declarations of theft."""
    reasons, score = [], 0
    if resolution == 'expected':
        return result('collected', 0, ['Owner confirmed the pickup was expected.'])
    if resolution == 'missing':
        return result('incident', 90, ['Owner reported the package missing. This does not establish who removed it.'])
    reliable = [e for e in events if e['confidence'] >= .7]
    removed = [e for e in reliable if e['kind'] == 'package_removed']
    delivered = [e for e in reliable if e['kind'] == 'package_delivered']
    status = 'awaiting_delivery'
    if delivered:
        status = 'delivered'
    if removed:
        status = 'needs_confirmation'
        removal = removed[-1]
        trusted = any(w['starts_at'] <= removal['occurred_at'] <= w['ends_at']
                      and w['created_at'] <= removal['occurred_at'] and not w['revoked']
                      for w in windows)
        if trusted:
            return result('collected', 0, ['Pickup occurred in an authorized delivery-specific window.'])
        score = 35
        reasons.append('Package removal was observed without a matching trusted pickup window; ask the owner.')
    # Only recent behaviour around the relevant event contributes to risk.
    anchor = datetime.fromisoformat(removed[-1]['occurred_at']) if removed else clock
    recent = [e for e in reliable if anchor - timedelta(minutes=10) <= datetime.fromisoformat(e['occurred_at']) <= anchor]
    approaches = sum(e['kind'] == 'person_approached' for e in recent)
    if approaches >= 3:
        score += 25
        reasons.append(f'{approaches} approaches were recorded within ten minutes; intent is unknown.')
    if any(e['kind'] == 'person_lingering' and e['observations']['duration_seconds'] >= 90 for e in recent):
        score += 25
        reasons.append('Lingering of at least 90 seconds was reported near the delivery.')
    if any(e['observations']['looking_around'] for e in recent):
        score += 10
        reasons.append('Looking-around behaviour was reported; this alone is not evidence of wrongdoing.')
    if delivered and not removed and clock - datetime.fromisoformat(delivered[0]['occurred_at']) > timedelta(hours=2):
        score = max(score, 25)
        reasons.append('The package has remained outside for more than two hours; consider arranging pickup.')
    if any(e['confidence'] < .7 for e in events):
        reasons.append('Low-confidence observations were excluded from risk scoring.')
    return result(status, min(score, 100), reasons or ['No concerning behaviour is established by the available events.'])


def result(status, score, reasons):
    level = 'high_risk' if score >= 75 else 'suspicious' if score >= 50 else 'needs_confirmation' if score >= 25 else 'normal'
    suggestions = [] if level == 'normal' else ['notify_owner']
    if score >= 50:
        suggestions += ['turn_on_lights', 'play_warning']
    return {'status': status, 'risk': {'level': level, 'score': score,
            'score_type': 'heuristic_not_probability', 'reasons': reasons}, 'suggested_actions': suggestions}
