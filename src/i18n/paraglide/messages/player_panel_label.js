/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Player_Panel_LabelInputs */

const uk_player_panel_label = /** @type {(inputs: Player_Panel_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Програвач`)
};

const en_player_panel_label = /** @type {(inputs: Player_Panel_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Player`)
};

/**
* | output |
* | --- |
* | "Player" |
*
* @param {Player_Panel_LabelInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const player_panel_label = /** @type {((inputs?: Player_Panel_LabelInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Player_Panel_LabelInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_player_panel_label(inputs)
	return en_player_panel_label(inputs)
});