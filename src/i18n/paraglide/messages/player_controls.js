/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Player_ControlsInputs */

const uk_player_controls = /** @type {(inputs: Player_ControlsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Керування`)
};

const en_player_controls = /** @type {(inputs: Player_ControlsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Controls`)
};

/**
* | output |
* | --- |
* | "Controls" |
*
* @param {Player_ControlsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const player_controls = /** @type {((inputs?: Player_ControlsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Player_ControlsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_player_controls(inputs)
	return en_player_controls(inputs)
});