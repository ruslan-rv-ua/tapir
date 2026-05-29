/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Active_Recordings_ZeroInputs */

const uk_active_recordings_zero = /** @type {(inputs: Active_Recordings_ZeroInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Немає записів`)
};

const en_active_recordings_zero = /** @type {(inputs: Active_Recordings_ZeroInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`No recordings`)
};

/**
* | output |
* | --- |
* | "No recordings" |
*
* @param {Active_Recordings_ZeroInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const active_recordings_zero = /** @type {((inputs?: Active_Recordings_ZeroInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Active_Recordings_ZeroInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_active_recordings_zero(inputs)
	return en_active_recordings_zero(inputs)
});