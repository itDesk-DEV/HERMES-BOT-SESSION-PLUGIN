# Sesje Bota — pakiet instalacyjny

**Wydanie:** 28 września 2026
**Przetestowany checkout Hermes:** `802ae8544b`
**Platforma:** Windows / Hermes Desktop

Panel **Sesje Bota** dodaje do Bot Mode trwałą kolumnę po prawej stronie obszaru rozmowy. Pokazuje sesje aktualnie zaznaczonego Bota, pozwala je otwierać, tworzyć nową sesję oraz przeszukiwać pełną historię wiadomości z rankingiem FTS/BM25.

## Co zawiera paczka

- `plugin/plugin.js` — plugin Desktopu;
- `patches/core-integration.patch` — niewielka integracja z kodem Hermes:
  - sygnał zmiany zaznaczonego Bota dla niezależnego panelu;
  - bezpieczne otwieranie sesji przez Bot Mode, bez błędu „superseded by a newer selection”;
  - RPC `session.search`, które używa lokalnego indeksu FTS5/BM25;
- `Install-BotSessionPane.ps1` — bezpieczny instalator z kopią zapasową i walidacją patcha;
- `Uninstall-BotSessionPane.ps1` — odinstalowanie z odwróceniem patcha, jeśli pliki nie zostały później zmienione.

> [!IMPORTANT]
> To nie jest wyłącznie plugin UI. Pełne wyszukiwanie oraz niezawodne otwieranie sesji wymagają również patcha w `hermes-agent`. Instalator **nie nadpisuje** całych plików źródłowych — korzysta z `git apply --check` i zatrzymuje się, jeśli checkout kolegi nie jest kompatybilny.

## Instalacja

1. Zamknij wszystkie okna Hermes Desktop na komputerze kolegi.
2. Rozpakuj ZIP, np. do `C:\Users\<użytkownik>\Downloads\bot-session-pane`.
3. Otwórz **PowerShell** w tym folderze.
4. Uruchom:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\Install-BotSessionPane.ps1
   ```

5. Instalator:
   - sprawdzi, czy lokalny checkout `hermes-agent` jest repozytorium Git i czy patch da się zastosować;
   - utworzy kopię zapasową w `%LOCALAPPDATA%\hermes\backups\bot-session-pane-<timestamp>`;
   - zainstaluje plugin do `%LOCALAPPDATA%\hermes\desktop-plugins\bot-session-pane-stable\`;
   - zastosuje patch do kodu Hermes;
   - zbuduje Hermes Desktop.

6. Uruchom Hermes Desktop:

   ```powershell
   hermes desktop
   ```

## Inna lokalizacja Hermes Home

Jeśli kolega używa innego katalogu Hermes, przekaż go jawnie:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-BotSessionPane.ps1 -HermesHome 'D:\Hermes'
```

## Szybki test po instalacji

1. Wejdź w **BOTS** i wybierz dowolnego Bota.
2. Po prawej powinna być widoczna kolumna **Sesje Bota**.
3. Kliknij starszą sesję — ma otworzyć się bez błędu `Session open was superseded by a newer selection`.
4. Wpisz słowo w polu wyszukiwania. Pod polem powinno pojawić się `… wyników · ranking FTS/BM25`.
5. Kliknij **Nowa sesja** — ma utworzyć sesję dla aktualnie zaznaczonego Bota.

## Gdy instalator odmawia zastosowania patcha

Nie wymuszaj instalacji. Najczęstszy powód to inna wersja lub lokalne modyfikacje Bot Mode u kolegi. Wyślij wtedy komunikat błędu wraz z wynikiem:

```powershell
git -C "$env:LOCALAPPDATA\hermes\hermes-agent" rev-parse --short HEAD
git -C "$env:LOCALAPPDATA\hermes\hermes-agent" status --short
```

Patch można wtedy bezpiecznie dostosować do jego wersji, zamiast nadpisywać jego zmiany.

## Odinstalowanie

Zamknij Hermes Desktop, a następnie w katalogu paczki uruchom:

```powershell
powershell -ExecutionPolicy Bypass -File .\Uninstall-BotSessionPane.ps1
```

Skrypt usuwa tylko katalog tego pluginu i odwraca patch wyłącznie wtedy, gdy Git potwierdzi, że można zrobić to bez konfliktu.

## Bezpieczeństwo

Paczka nie zawiera haseł, tokenów, baz sesji ani historii rozmów. Działa wyłącznie lokalnie na danych Hermes kolegi.
