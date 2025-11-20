import React from 'react';
import { LocaleProvider } from '../contexts/LocaleContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { LayoutProvider } from '../contexts/LayoutContext';
import { PositioningProvider } from '../contexts/PositioningContext';
import { RulesProvider } from '../contexts/RulesContext';
import { CharacterProvider } from '../contexts/CharacterContext';
import { GlyphDataProvider } from '../contexts/GlyphDataContext';
import { KerningProvider } from '../contexts/KerningContext';
import { SettingsProvider } from '../contexts/SettingsContext';
import { ClipboardProvider } from '../contexts/ClipboardContext';

const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <LayoutProvider>
          <CharacterProvider>
            <GlyphDataProvider>
              <KerningProvider>
                <SettingsProvider>
                  <ClipboardProvider>
                    <PositioningProvider>
                      <RulesProvider>
                        {children}
                      </RulesProvider>
                    </PositioningProvider>
                  </ClipboardProvider>
                </SettingsProvider>
              </KerningProvider>
            </GlyphDataProvider>
          </CharacterProvider>
        </LayoutProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
};

export default AppProviders;
