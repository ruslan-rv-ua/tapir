/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Status_ConnectingInputs */

const uk_status_connecting = /** @type {(inputs: Status_ConnectingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Підключення...`)
};

const en_status_connecting = /** @type {(inputs: Status_ConnectingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Connecting...`)
};

/**
* | output |
* | --- |
* | "Connecting..." |
*
* @param {Status_ConnectingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const status_connecting = /** @type {((inputs?: Status_ConnectingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Status_ConnectingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_status_connecting(inputs)
	return en_status_connecting(inputs)
});