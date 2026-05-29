/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Player_DeviceInputs */

const uk_player_device = /** @type {(inputs: Player_DeviceInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Пристрій`)
};

const en_player_device = /** @type {(inputs: Player_DeviceInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Device`)
};

/**
* | output |
* | --- |
* | "Device" |
*
* @param {Player_DeviceInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const player_device = /** @type {((inputs?: Player_DeviceInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Player_DeviceInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_player_device(inputs)
	return en_player_device(inputs)
});