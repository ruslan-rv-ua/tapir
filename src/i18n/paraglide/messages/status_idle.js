/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Status_IdleInputs */

const uk_status_idle = /** @type {(inputs: Status_IdleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Очікування`)
};

const en_status_idle = /** @type {(inputs: Status_IdleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Idle`)
};

/**
* | output |
* | --- |
* | "Idle" |
*
* @param {Status_IdleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const status_idle = /** @type {((inputs?: Status_IdleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Status_IdleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_status_idle(inputs)
	return en_status_idle(inputs)
});