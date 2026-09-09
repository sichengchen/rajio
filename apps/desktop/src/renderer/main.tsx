if (new URLSearchParams(location.search).has('surface')) {
  void import('./control-surface');
} else {
  void import('./main-app');
}
